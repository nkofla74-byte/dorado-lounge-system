import type { UserRole } from '@dorado/shared-types';

// Fuente ÚNICA de los roles que un admin puede asignar al crear o editar
// personal de su sala. `superuser` se excluye (no se puede escalar privilegios
// desde el panel de personal; el bypass de superuser vive en assertCan).
//
// Usado por: el schema de validación server-side (admin/personal/actions.ts),
// el diálogo de creación y el selector de cambio de rol del panel. Mantener
// alineado con el enum `UserRole` de @dorado/shared-types.
export const ASSIGNABLE_ROLES = [
  'admin',
  'chef',
  'chef_cocina_fria',
  'chef_cocina_caliente',
  'sous_chef',
  'mesero_amex',
  'personal_almacen',
  'personal_pasteleria',
  'personal_snack',
  'personal_buffet',
  'steward',
] as const satisfies readonly UserRole[];

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];
