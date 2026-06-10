'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { toast } from 'sonner';
import { Users, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CrearUsuarioDialog } from './crear-usuario-dialog';
import { toggleUser, cambiarRolUsuario } from '@/modules/superuser/actions';
import type { TenantUser } from '@/modules/superuser/domain/superuser';

type RoleKey =
  | 'admin'
  | 'chef'
  | 'chef_cocina_fria'
  | 'chef_cocina_caliente'
  | 'sous_chef'
  | 'mesero_amex';

const ASSIGNABLE_ROLES: RoleKey[] = [
  'admin',
  'chef',
  'chef_cocina_fria',
  'chef_cocina_caliente',
  'sous_chef',
  'mesero_amex',
];

interface Props {
  tenantId: string;
  initialUsers: TenantUser[];
}

export function UsersPanel({ tenantId, initialUsers }: Props) {
  const t = useTranslations('admin.users');
  const tC = useTranslations('admin.common');
  const tR = useTranslations('roles');
  const locale = useLocale();
  const [users, setUsers] = useState<TenantUser[]>(initialUsers);
  const [isPending, startTransition] = useTransition();

  const handleToggle = (userId: string, activo: boolean) => {
    startTransition(async () => {
      const result = await toggleUser(userId, activo);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, activo: result.value.activo } : u)),
      );
      toast.success(activo ? tC('usuarioActivado') : tC('usuarioDesactivado'));
    });
  };

  const handleRoleChange = (userId: string, role: string) => {
    startTransition(async () => {
      const result = await cambiarRolUsuario(userId, role);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: result.value.role } : u)),
      );
      toast.success(tC('rolActualizado'));
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{t('count', { n: users.length })}</span>
        </div>
        <CrearUsuarioDialog tenantId={tenantId} onSuccess={() => window.location.reload()} />
      </div>

      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/20">
          <Users className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('emptyTitle')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tC('colNombre')}</TableHead>
                <TableHead>{tC('colEmail')}</TableHead>
                <TableHead>{tC('colRol')}</TableHead>
                <TableHead>{tC('colEstado')}</TableHead>
                <TableHead>{tC('colCreado')}</TableHead>
                <TableHead className="text-right">{tC('colAcciones')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className={!user.activo ? 'opacity-60' : ''}>
                  <TableCell className="font-medium">{user.nombre}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{user.email}</TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      onValueChange={(role) => handleRoleChange(user.id, role)}
                      disabled={isPending}
                    >
                      <SelectTrigger className="h-7 text-xs w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNABLE_ROLES.map((role) => (
                          <SelectItem key={role} value={role} className="text-xs">
                            {tR(role)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {user.activo ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {tC('activo')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        {tC('inactivo')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(user.createdAt).toLocaleDateString(
                      locale === 'en' ? 'en-US' : 'es-CO',
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleToggle(user.id, !user.activo)}
                    >
                      {isPending ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : user.activo ? (
                        tC('desactivar')
                      ) : (
                        tC('activar')
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
