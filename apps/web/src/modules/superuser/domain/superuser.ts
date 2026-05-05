import type { UserRole } from '@dorado/shared-types';

export interface Tenant {
  id: string;
  nombre: string;
  slug: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TenantUser {
  id: string;
  tenantId: string;
  nombre: string;
  email: string;
  role: UserRole;
  activo: boolean;
  createdAt: Date;
}

export class TenantSlugInvalidoError extends Error {
  override readonly name = 'TenantSlugInvalidoError' as const;
  constructor(msg: string) {
    super(msg);
  }
}

export function validarSlug(slug: string): void {
  if (!/^[a-z0-9-]{3,32}$/.test(slug)) {
    throw new TenantSlugInvalidoError(
      `Slug inválido: "${slug}". Solo minúsculas, números y guiones (3-32 caracteres).`,
    );
  }
}
