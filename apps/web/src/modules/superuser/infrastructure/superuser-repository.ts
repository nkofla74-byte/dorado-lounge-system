import { createAdminClient } from '@/lib/supabase/admin';
import type {
  SuperuserRepository,
  CreateUserInput,
} from '../application/ports/superuser-repository.port';
import type { Tenant, TenantUser } from '../domain/superuser';
import type { UserRole } from '@dorado/shared-types';

function mapTenant(row: Record<string, unknown>): Tenant {
  return {
    id: row['id'] as string,
    nombre: row['nombre'] as string,
    slug: row['slug'] as string,
    activo: row['activo'] as boolean,
    createdAt: new Date(row['created_at'] as string),
    updatedAt: new Date(row['updated_at'] as string),
    deletedAt: row['deleted_at'] ? new Date(row['deleted_at'] as string) : null,
  };
}

function mapUser(row: Record<string, unknown>, email: string): TenantUser {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    nombre: row['nombre'] as string,
    email,
    role: row['role'] as UserRole,
    activo: row['activo'] as boolean,
    createdAt: new Date(row['created_at'] as string),
  };
}

class SupabaseSuperuserRepository implements SuperuserRepository {
  private get admin() {
    return createAdminClient();
  }

  async listTenants(): Promise<Tenant[]> {
    const { data, error } = await this.admin
      .from('tenants')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapTenant);
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    const { data, error } = await this.admin
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .is('deleted_at', null)
      .single();
    if (error) return null;
    return mapTenant(data);
  }

  async createTenant(nombre: string, slug: string): Promise<Tenant> {
    const { data, error } = await this.admin
      .from('tenants')
      .insert({ nombre, slug })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapTenant(data);
  }

  async toggleTenant(tenantId: string, activo: boolean): Promise<Tenant> {
    const { data, error } = await this.admin
      .from('tenants')
      .update({ activo, updated_at: new Date().toISOString() })
      .eq('id', tenantId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapTenant(data);
  }

  async listUsers(tenantId?: string): Promise<TenantUser[]> {
    const base = this.admin.from('users').select('*').is('deleted_at', null);
    const filtered = tenantId ? base.eq('tenant_id', tenantId) : base;
    const { data: users, error } = await filtered.order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    // Fetch all auth users to build an id→email map (avoids N+1)
    const { data: authList } = await this.admin.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = new Map<string, string>(
      (authList?.users ?? []).map((u) => [u.id, u.email ?? '']),
    );

    return (users ?? []).map((u: Record<string, unknown>) =>
      mapUser(u, emailMap.get(u['id'] as string) ?? ''),
    );
  }

  async createUser(input: CreateUserInput): Promise<TenantUser> {
    const admin = this.admin;

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        tenant_id: input.tenantId,
        role: input.role,
      },
    });
    if (authError) throw new Error(authError.message);

    const authUser = authData.user;

    const { data, error } = await admin
      .from('users')
      .insert({
        id: authUser.id,
        tenant_id: input.tenantId,
        nombre: input.nombre,
        role: input.role,
        activo: true,
      })
      .select()
      .single();
    if (error) {
      // Rollback auth user creation to avoid orphans
      await admin.auth.admin.deleteUser(authUser.id);
      throw new Error(error.message);
    }

    return mapUser(data, input.email);
  }

  async toggleUser(userId: string, activo: boolean): Promise<TenantUser> {
    const admin = this.admin;

    const { data, error } = await admin
      .from('users')
      .update({ activo, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { data: authData } = await admin.auth.admin.getUserById(userId);
    return mapUser(data, authData?.user?.email ?? '');
  }

  async updateUserRole(userId: string, role: UserRole): Promise<TenantUser> {
    const admin = this.admin;

    const { data, error } = await admin
      .from('users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Propagate role change to JWT claims via app_metadata
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { role },
    });

    const { data: authData } = await admin.auth.admin.getUserById(userId);
    return mapUser(data, authData?.user?.email ?? '');
  }
}

export function createSuperuserRepository(): SuperuserRepository {
  return new SupabaseSuperuserRepository();
}
