'use client';

import { PERMISSIONS } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import { Check, Minus } from 'lucide-react';
import type { UserRole } from '@dorado/shared-types';

// Roles que aparecen en la matriz (superuser se omite — tiene bypass total)
const ROLES: UserRole[] = [
  'admin',
  'chef',
  'sous_chef',
  'mesero_amex',
  'recepcion',
  'personal_snack',
  'personal_buffet',
  'personal_almacen',
  'personal_pasteleria',
  'steward',
];

const ROLE_LABELS: Record<UserRole, string> = {
  superuser: 'Superuser',
  admin: 'Admin',
  chef: 'Chef',
  sous_chef: 'Sous Chef',
  mesero_amex: 'Mesero Amex',
  recepcion: 'Recepción',
  personal_snack: 'Snack',
  personal_buffet: 'Buffet',
  personal_almacen: 'Almacén',
  personal_pasteleria: 'Pastelería',
  steward: 'Steward',
};

// Agrupar permisos por módulo
const PERMISSION_GROUPS: Record<string, string[]> = {
  Inventario: Object.keys(PERMISSIONS).filter((p) => p.startsWith('inventory:')),
  Recetas: Object.keys(PERMISSIONS).filter((p) => p.startsWith('recipes:')),
  Producción: Object.keys(PERMISSIONS).filter((p) => p.startsWith('production:')),
  Pedidos: Object.keys(PERMISSIONS).filter((p) => p.startsWith('orders:')),
  Buffet: Object.keys(PERMISSIONS).filter((p) => p.startsWith('buffet:')),
  Snack: Object.keys(PERMISSIONS).filter((p) => p.startsWith('snack:')),
  Analytics: Object.keys(PERMISSIONS).filter((p) => p.startsWith('analytics:')),
  Afluencia: Object.keys(PERMISSIONS).filter((p) => p.startsWith('afluencia:')),
  Turnos: Object.keys(PERMISSIONS).filter((p) => p.startsWith('turnos:')),
  'Usuarios y Tenants': Object.keys(PERMISSIONS).filter(
    (p) => p.startsWith('users:') || p.startsWith('tenants:'),
  ),
  Chat: Object.keys(PERMISSIONS).filter((p) => p.startsWith('chat:')),
  Auditoría: Object.keys(PERMISSIONS).filter((p) => p.startsWith('audit:')),
  'Feature Flags': Object.keys(PERMISSIONS).filter((p) => p.startsWith('feature_flags:')),
};

function PermissionCell({ allowed }: { allowed: boolean }) {
  return (
    <td className="px-3 py-2 text-center">
      {allowed ? (
        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mx-auto" />
      ) : (
        <Minus className="h-3 w-3 text-muted-foreground/40 mx-auto" />
      )}
    </td>
  );
}

export function PermissionMatrix() {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="text-xs w-full min-w-max border-collapse">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="text-left px-4 py-3 font-semibold text-sm sticky left-0 bg-muted/50 min-w-[180px]">
              Permiso
            </th>
            {ROLES.map((role) => (
              <th
                key={role}
                className="px-3 py-3 font-semibold text-center whitespace-nowrap"
                title={role}
              >
                {ROLE_LABELS[role]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(PERMISSION_GROUPS).map(([group, permissions]) => (
            <>
              <tr key={`group-${group}`} className="bg-muted/30">
                <td
                  colSpan={ROLES.length + 1}
                  className="px-4 py-1.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide"
                >
                  {group}
                </td>
              </tr>
              {permissions.map((perm) => {
                const allowed = PERMISSIONS[perm] ?? [];
                return (
                  <tr
                    key={perm}
                    className={cn('border-b last:border-0 hover:bg-muted/20 transition-colors')}
                  >
                    <td className="px-4 py-2 font-mono sticky left-0 bg-background">
                      <span className="text-muted-foreground">{perm.split(':')[0]}:</span>
                      <span className="font-medium">{perm.split(':')[1]}</span>
                    </td>
                    {ROLES.map((role) => (
                      <PermissionCell key={role} allowed={allowed.includes(role)} />
                    ))}
                  </tr>
                );
              })}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
