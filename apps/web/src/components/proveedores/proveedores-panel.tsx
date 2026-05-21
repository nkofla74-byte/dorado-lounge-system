'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Plus,
  Pencil,
  Phone,
  Mail,
  User,
  ChevronDown,
  ChevronRight,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProveedorDialog } from './proveedor-dialog';
import { HistorialCompras } from './historial-compras';
import { updateProveedor } from '@/modules/proveedores/actions';
import { toast } from 'sonner';
import type { Proveedor } from '@/modules/proveedores/domain/proveedor';

interface ProveedoresPanelProps {
  initialData: Proveedor[];
  canWrite: boolean;
  showTenant?: boolean;
}

export function ProveedoresPanel({
  initialData,
  canWrite,
  showTenant = false,
}: ProveedoresPanelProps) {
  const t = useTranslations('proveedores');
  const [proveedores, setProveedores] = useState<Proveedor[]>(initialData);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Proveedor | undefined>();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSaved = (saved: Proveedor) => {
    setProveedores((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
  };

  const openCreate = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const openEdit = (p: Proveedor) => {
    setEditing(p);
    setDialogOpen(true);
  };

  const toggleActivo = async (p: Proveedor) => {
    const result = await updateProveedor(p.id, { activo: !p.activo });
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    handleSaved(result.value);
    toast.success(result.value.activo ? t('reactivado') : t('desactivado'));
  };

  const activos = proveedores.filter((p) => p.activo);
  const inactivos = proveedores.filter((p) => !p.activo);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span>{t('count', { n: activos.length })}</span>
        </div>
        {canWrite && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            {t('nuevo')}
          </Button>
        )}
      </div>

      {/* Lista */}
      {proveedores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
          <Building2 className="h-10 w-10 opacity-30" />
          {t('empty')}
        </div>
      ) : (
        <div className="space-y-2">
          {[...activos, ...inactivos].map((p) => {
            const isExpanded = expandedId === p.id;
            return (
              <div key={p.id} className="rounded-lg border border-border bg-card">
                {/* Header row */}
                <div className="flex items-center gap-3 p-4">
                  <button
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`font-medium text-sm ${!p.activo ? 'text-muted-foreground line-through' : ''}`}
                      >
                        {p.nombre}
                      </span>
                      {showTenant && p.tenantNombre && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                          {p.tenantNombre}
                        </Badge>
                      )}
                      {!p.activo && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          {t('inactivo')}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {p.contacto && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {p.contacto}
                        </span>
                      )}
                      {p.telefono && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {p.telefono}
                        </span>
                      )}
                      {p.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {p.email}
                        </span>
                      )}
                    </div>
                  </div>

                  {canWrite && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground"
                        onClick={() => toggleActivo(p)}
                      >
                        {p.activo ? t('desactivar') : t('reactivar')}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Historial expandido */}
                {isExpanded && (
                  <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
                    {p.notas && <p className="text-xs text-muted-foreground italic">{p.notas}</p>}
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t('historialTitle')}
                    </p>
                    <HistorialCompras proveedorId={p.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ProveedorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        proveedor={editing}
        onSaved={handleSaved}
      />
    </div>
  );
}
