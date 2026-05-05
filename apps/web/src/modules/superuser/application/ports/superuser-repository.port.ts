import type { UserRole } from '@dorado/shared-types';
import type { Tenant, TenantUser } from '../../domain/superuser';

export interface CreateUserInput {
  tenantId: string;
  nombre: string;
  email: string;
  role: UserRole;
  password: string;
}

export interface SuperuserRepository {
  listTenants(): Promise<Tenant[]>;
  getTenant(tenantId: string): Promise<Tenant | null>;
  createTenant(nombre: string, slug: string): Promise<Tenant>;
  toggleTenant(tenantId: string, activo: boolean): Promise<Tenant>;

  listUsers(tenantId?: string): Promise<TenantUser[]>;
  createUser(input: CreateUserInput): Promise<TenantUser>;
  toggleUser(userId: string, activo: boolean): Promise<TenantUser>;
  updateUserRole(userId: string, role: UserRole): Promise<TenantUser>;
}
