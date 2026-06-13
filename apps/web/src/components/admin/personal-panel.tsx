'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { toast } from 'sonner';
import { Users, CheckCircle2, XCircle, RefreshCw, Trash2 } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CrearPersonalDialog } from './crear-personal-dialog';
import {
  togglePersonal,
  cambiarRolPersonal,
  eliminarPersonal,
} from '@/app/(dashboard)/admin/personal/actions';
import { ASSIGNABLE_ROLES } from '@/lib/auth/assignable-roles';
import type { TenantUser } from '@/modules/superuser/domain/superuser';

interface Props {
  initialUsers: TenantUser[];
  currentUserId: string;
}

export function PersonalPanel({ initialUsers, currentUserId }: Props) {
  const t = useTranslations('admin.personal');
  const tC = useTranslations('admin.common');
  const tR = useTranslations('roles');
  const locale = useLocale();
  const [users, setUsers] = useState<TenantUser[]>(initialUsers);
  const [isPending, startTransition] = useTransition();
  const [toDelete, setToDelete] = useState<TenantUser | null>(null);

  const handleToggle = (userId: string, activo: boolean) => {
    startTransition(async () => {
      const result = await togglePersonal(userId, activo);
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
      const result = await cambiarRolPersonal(userId, role);
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

  const handleCreated = (user: TenantUser) => {
    setUsers((prev) => [user, ...prev]);
  };

  const handleDelete = () => {
    if (!toDelete) return;
    const target = toDelete;
    startTransition(async () => {
      const result = await eliminarPersonal(target.id);
      if (!result.ok) {
        toast.error(result.error.message);
        setToDelete(null);
        return;
      }
      if (result.value.mode === 'deleted') {
        setUsers((prev) => prev.filter((u) => u.id !== target.id));
        toast.success(t('eliminar.toastEliminado'));
      } else {
        // Anonimizado: la fila persiste como tombstone inactivo.
        setUsers((prev) =>
          prev.map((u) =>
            u.id === target.id
              ? { ...u, activo: false, nombre: t('eliminar.tombstoneNombre'), email: '—' }
              : u,
          ),
        );
        toast.success(t('eliminar.toastAnonimizado'));
      }
      setToDelete(null);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{t('count', { n: users.length })}</span>
        </div>
        <CrearPersonalDialog onSuccess={(user) => handleCreated(user)} />
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
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <TableRow key={user.id} className={!user.activo ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">
                      {user.nombre}
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">{t('tu')}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{user.email}</TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(role) => handleRoleChange(user.id, role)}
                        disabled={isPending || isSelf}
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
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending || isSelf}
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
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending || isSelf}
                          onClick={() => setToDelete(user)}
                          aria-label={t('eliminar.cta')}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('eliminar.confirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('eliminar.confirmDesc', { nombre: toDelete?.nombre ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={isPending} onClick={() => setToDelete(null)}>
              {t('eliminar.cancelar')}
            </Button>
            <Button variant="destructive" disabled={isPending} onClick={handleDelete}>
              {isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : t('eliminar.cta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
