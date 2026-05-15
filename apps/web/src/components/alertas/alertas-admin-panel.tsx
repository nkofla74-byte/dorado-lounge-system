'use client';

import { useState, useCallback } from 'react';
import {
  AlertTriangle,
  Info,
  Bell,
  RefreshCw,
  CheckCheck,
  Clock,
  PackageCheck,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  getAlertasAdmin,
  marcarAlertaLeida,
  marcarTodasLeidas,
  checkVencimientos,
  checkDemoraAmex,
} from '@/modules/alertas/actions';
import { toast } from 'sonner';
import type { Alerta } from '@/modules/alertas/domain/alerta';

type Filtro = 'todas' | 'no_leidas' | 'critical';

const TIPO_LABEL: Record<Alerta['tipo'], string> = {
  stock_minimo: 'Stock mínimo',
  vencimiento: 'Vencimiento',
  cambio_precio: 'Cambio precio',
  demora_amex: 'Demora Amex',
};

function SeveridadIcon({ severidad }: { severidad: Alerta['severidad'] }) {
  if (severidad === 'critical')
    return <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  if (severidad === 'warning')
    return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
  return <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
}

function formatTs(d: Date): string {
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface AlertasAdminPanelProps {
  initialData: Alerta[];
}

export function AlertasAdminPanel({ initialData }: AlertasAdminPanelProps) {
  const [alertas, setAlertas] = useState<Alerta[]>(initialData);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState<'vencimientos' | 'demoras' | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await getAlertasAdmin();
    if (r.ok) setAlertas(r.value);
    setLoading(false);
  }, []);

  const handleMarcarLeida = async (id: string) => {
    await marcarAlertaLeida(id);
    setAlertas((prev) => prev.map((a) => (a.id === id ? { ...a, leida: true } : a)));
  };

  const handleMarcarTodas = async () => {
    await marcarTodasLeidas();
    setAlertas((prev) => prev.map((a) => ({ ...a, leida: true })));
  };

  const handleCheckVencimientos = async () => {
    setChecking('vencimientos');
    const r = await checkVencimientos(3);
    setChecking(null);
    if (r.ok) {
      toast.success(
        r.value > 0
          ? `${r.value} alerta${r.value !== 1 ? 's' : ''} de vencimiento generada${r.value !== 1 ? 's' : ''}`
          : 'Sin lotes próximos a vencer',
      );
      if (r.value > 0) await refresh();
    } else {
      toast.error(r.error.message);
    }
  };

  const handleCheckDemoras = async () => {
    setChecking('demoras');
    const r = await checkDemoraAmex(15);
    setChecking(null);
    if (r.ok) {
      toast.success(
        r.value > 0
          ? `${r.value} alerta${r.value !== 1 ? 's' : ''} de demora generada${r.value !== 1 ? 's' : ''}`
          : 'Sin pedidos con demora',
      );
      if (r.value > 0) await refresh();
    } else {
      toast.error(r.error.message);
    }
  };

  const noLeidas = alertas.filter((a) => !a.leida).length;
  const criticas = alertas.filter((a) => !a.leida && a.severidad === 'critical').length;

  const filtered = alertas.filter((a) => {
    if (filtro === 'no_leidas') return !a.leida;
    if (filtro === 'critical') return a.severidad === 'critical';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Total alertas
          </p>
          <p className="text-2xl font-bold tabular-nums">{alertas.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" /> No leídas
          </p>
          <p
            className={cn('text-2xl font-bold tabular-nums', noLeidas > 0 ? 'text-amber-500' : '')}
          >
            {noLeidas}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Críticas
          </p>
          <p className={cn('text-2xl font-bold tabular-nums', criticas > 0 ? 'text-red-500' : '')}>
            {criticas}
          </p>
        </div>
      </div>

      {/* Acciones de verificación */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={handleCheckVencimientos}
          disabled={checking !== null}
        >
          {checking === 'vencimientos' ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PackageCheck className="h-3.5 w-3.5" />
          )}
          Verificar vencimientos (3d)
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={handleCheckDemoras}
          disabled={checking !== null}
        >
          {checking === 'demoras' ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Clock className="h-3.5 w-3.5" />
          )}
          Verificar demoras Amex (15 min)
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={loading}
          className="gap-1.5 text-muted-foreground"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Actualizar
        </Button>
        {noLeidas > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarcarTodas}
            className="gap-1.5 text-muted-foreground"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Marcar todas
          </Button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {(['todas', 'no_leidas', 'critical'] as Filtro[]).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              filtro === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground',
            )}
          >
            {f === 'todas' ? 'Todas' : f === 'no_leidas' ? 'No leídas' : 'Críticas'}
          </button>
        ))}
        <span className="ml-2 self-center text-xs text-muted-foreground">
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Lista */}
      <div className="rounded-md border border-border divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
            Sin alertas{filtro !== 'todas' ? ' con este filtro' : ''}
          </div>
        ) : (
          filtered.map((alerta) => (
            <button
              key={alerta.id}
              className={cn(
                'w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors flex gap-3',
                !alerta.leida && 'bg-muted/20',
              )}
              onClick={() => !alerta.leida && handleMarcarLeida(alerta.id)}
            >
              <SeveridadIcon severidad={alerta.severidad} />
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      'text-sm font-medium truncate',
                      alerta.leida ? 'text-muted-foreground' : 'text-foreground',
                    )}
                  >
                    {alerta.titulo}
                  </p>
                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                    {formatTs(alerta.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1 text-left">
                  {alerta.mensaje}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                    {TIPO_LABEL[alerta.tipo]}
                  </Badge>
                  {!alerta.leida && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 text-primary">
                      Nueva
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
