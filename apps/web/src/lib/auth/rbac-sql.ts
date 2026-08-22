import type { UserRole } from '@dorado/shared-types';
import { PERMISSIONS } from './permissions';

// Fuente única de la matriz de permisos: `PERMISSIONS` (TypeScript).
//
// La base de datos necesita la misma matriz para poder autorizar por sí misma
// (defensa en profundidad: la RLS no puede depender de que la app haya llamado
// a assertCan). En vez de mantener dos listas de roles a mano —que fue el origen
// de la deriva RC-2— la tabla `rbac_permisos` se deriva de esta constante y una
// prueba comprueba que la migración commiteada sigue coincidiendo.

const MARCA_INICIO = '-- <<< rbac:generado — no editar a mano >>>';
const MARCA_FIN = '-- <<< /rbac:generado >>>';

export const RBAC_MARCADORES = { inicio: MARCA_INICIO, fin: MARCA_FIN } as const;

/** Pares (permiso, rol) de la matriz, ordenados de forma estable. */
export function pares(): Array<{ permiso: string; role: UserRole }> {
  return Object.entries(PERMISSIONS)
    .flatMap(([permiso, roles]) => roles.map((role) => ({ permiso, role })))
    .sort((a, b) => a.permiso.localeCompare(b.permiso) || a.role.localeCompare(b.role));
}

/**
 * Bloque SQL que rellena `public.rbac_permisos`. Se regenera con
 * `pnpm rbac:generate` y vive entre marcadores dentro de la migración, para que
 * el resto del archivo (comentarios, DDL, rollback) se mantenga escrito a mano.
 */
export function bloqueRbacSql(): string {
  const filas = pares()
    .map(({ permiso, role }) => `  ('${permiso}', '${role}')`)
    .join(',\n');

  return [
    MARCA_INICIO,
    '-- Derivado de apps/web/src/lib/auth/permissions.ts. Regenerar con `pnpm rbac:generate`.',
    'DELETE FROM public.rbac_permisos;',
    'INSERT INTO public.rbac_permisos (permiso, role) VALUES',
    `${filas};`,
    MARCA_FIN,
  ].join('\n');
}

/** Extrae el bloque generado de un archivo de migración ya escrito. */
export function extraerBloqueRbac(sql: string): string | null {
  const inicio = sql.indexOf(MARCA_INICIO);
  const fin = sql.indexOf(MARCA_FIN);
  if (inicio === -1 || fin === -1) return null;
  return sql.slice(inicio, fin + MARCA_FIN.length);
}
