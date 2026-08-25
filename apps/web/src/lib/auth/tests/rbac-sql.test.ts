import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bloqueRbacSql, extraerBloqueRbac, pares, RBAC_MARCADORES } from '../rbac-sql';
import { PERMISSIONS } from '../permissions';

// Guardián de la causa raíz RC-2: la matriz de permisos vive en PERMISSIONS y
// la base la necesita para autorizar por su cuenta. Esta prueba falla si alguien
// cambia una y no la otra — que es exactamente cómo se produjo la deriva que
// dejó a chef_cocina_fria fuera de las políticas de producción.
//
// Para regenerar tras un cambio legítimo: `pnpm rbac:generate`.

const MIGRACION = resolve(
  __dirname,
  '../../../../../../supabase/migrations/20260822000002_rbac_matriz.sql',
);

describe('matriz RBAC: TypeScript ↔ SQL', () => {
  it('la migración contiene el bloque generado', () => {
    const sql = readFileSync(MIGRACION, 'utf8');
    expect(sql).toContain(RBAC_MARCADORES.inicio);
    expect(sql).toContain(RBAC_MARCADORES.fin);
  });

  it('el bloque commiteado coincide con PERMISSIONS', () => {
    const sql = readFileSync(MIGRACION, 'utf8');
    const esperado = bloqueRbacSql();

    if (process.env['UPDATE_RBAC'] === '1') {
      const actual = extraerBloqueRbac(sql);
      if (actual !== null && actual !== esperado) {
        writeFileSync(MIGRACION, sql.replace(actual, esperado), 'utf8');
      }
      return;
    }

    expect(extraerBloqueRbac(sql)).toBe(esperado);
  });

  it('cada permiso de la matriz aparece al menos una vez en el SQL', () => {
    const permisosConRoles = Object.entries(PERMISSIONS)
      .filter(([, roles]) => roles.length > 0)
      .map(([permiso]) => permiso);
    const generado = bloqueRbacSql();

    for (const permiso of permisosConRoles) {
      expect(generado).toContain(`('${permiso}',`);
    }
  });

  it('los permisos reservados a superuser no generan filas', () => {
    // tenants:read / tenants:write son [] en PERMISSIONS: superuser los obtiene
    // por el bypass de fn_puede, no por la matriz.
    const generados = new Set(pares().map((p) => p.permiso));
    expect(generados.has('tenants:read')).toBe(false);
    expect(generados.has('tenants:write')).toBe(false);
  });

  it('no emite filas para el rol superuser (tiene bypass)', () => {
    expect(pares().every((p) => p.role !== 'superuser')).toBe(true);
  });
});
