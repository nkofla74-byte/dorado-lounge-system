export interface FeatureFlag {
  id: string;
  tenantId: string | null; // null = flag global (aplica a todos los tenants)
  clave: string;
  valor: boolean;
  descripcion: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFeatureFlagInput {
  clave: string;
  valor?: boolean;
  descripcion?: string;
  tenantId?: string | null;
}

export function validarClave(clave: string): boolean {
  // snake_case, máximo 64 chars, solo letras minúsculas, números y _
  return /^[a-z][a-z0-9_]{0,62}[a-z0-9]$/.test(clave) || /^[a-z]$/.test(clave);
}
