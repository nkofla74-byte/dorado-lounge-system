'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Building2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
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
import { CrearTenantDialog } from './crear-tenant-dialog';
import { toggleTenant } from '@/modules/superuser/actions';
import type { Tenant } from '@/modules/superuser/domain/superuser';

interface Props {
  initialTenants: Tenant[];
}

export function TenantsPanel({ initialTenants }: Props) {
  const [tenants, setTenants] = useState<Tenant[]>(initialTenants);
  const [isPending, startTransition] = useTransition();

  const handleToggle = (tenantId: string, activo: boolean) => {
    startTransition(async () => {
      const result = await toggleTenant(tenantId, activo);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setTenants((prev) =>
        prev.map((t) => (t.id === tenantId ? { ...t, activo: result.value.activo } : t)),
      );
      toast.success(activo ? 'Tenant activado' : 'Tenant desactivado');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span>
            {tenants.length} tenant{tenants.length !== 1 ? 's' : ''}
          </span>
        </div>
        <CrearTenantDialog onSuccess={() => window.location.reload()} />
      </div>

      {tenants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/20">
          <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No hay tenants registrados</p>
          <p className="text-xs text-muted-foreground mt-1">Crea el primer tenant para comenzar</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">
                    <a
                      href={`/admin/tenants/${tenant.id}`}
                      className="hover:underline text-primary"
                    >
                      {tenant.nombre}
                    </a>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{tenant.slug}</code>
                  </TableCell>
                  <TableCell>
                    {tenant.activo ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Inactivo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(tenant.createdAt).toLocaleDateString('es-CO')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleToggle(tenant.id, !tenant.activo)}
                    >
                      {isPending ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : tenant.activo ? (
                        'Desactivar'
                      ) : (
                        'Activar'
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
