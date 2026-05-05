'use client';

import { useState, useTransition } from 'react';
import { RefreshCw, AlertTriangle, BarChart3, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  fetchCogsPerPassenger,
  fetchConsumoVsProduccion,
  refreshAnalytics,
} from '@/modules/analytics/actions';
import { KpiCards } from './kpi-cards';
import { CogsTable } from './cogs-table';
import { ConsumoTable } from './consumo-table';
import type { CogsPerPassenger, ConsumoInsumo } from '@/modules/analytics/domain/kpi';
import type { Turno } from '@/modules/turnos/domain/turno';

interface AnalyticsPanelProps {
  initialCogs: CogsPerPassenger[];
  initialConsumo: ConsumoInsumo[];
  turnos: Turno[];
  error?: string | undefined;
}

export function AnalyticsPanel({
  initialCogs,
  initialConsumo,
  turnos,
  error,
}: AnalyticsPanelProps) {
  const [cogs, setCogs] = useState<CogsPerPassenger[]>(initialCogs);
  const [consumo, setConsumo] = useState<ConsumoInsumo[]>(initialConsumo);
  const [turnoId, setTurnoId] = useState<string>('');
  const [desde, setDesde] = useState<string>('');
  const [hasta, setHasta] = useState<string>('');
  const [loadError, setLoadError] = useState<string | undefined>(error);
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const applyFilters = (overrides?: { turnoId?: string; desde?: string; hasta?: string }) => {
    const resolvedTurnoId = overrides?.turnoId !== undefined ? overrides.turnoId : turnoId;
    const resolvedDesde = overrides?.desde !== undefined ? overrides.desde : desde;
    const resolvedHasta = overrides?.hasta !== undefined ? overrides.hasta : hasta;
    const filters: { turnoId?: string; desde?: string; hasta?: string } = {};
    if (resolvedTurnoId) filters.turnoId = resolvedTurnoId;
    if (resolvedDesde) filters.desde = resolvedDesde;
    if (resolvedHasta) filters.hasta = resolvedHasta;

    startTransition(async () => {
      const [cogsResult, consumoResult] = await Promise.all([
        fetchCogsPerPassenger(filters),
        fetchConsumoVsProduccion(filters),
      ]);

      if (cogsResult.ok) setCogs(cogsResult.value);
      else setLoadError(cogsResult.error.message);

      if (consumoResult.ok) setConsumo(consumoResult.value);
    });
  };

  const handleTurnoChange = (value: string) => {
    setTurnoId(value);
    applyFilters({ turnoId: value });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setLoadError(undefined);
    const result = await refreshAnalytics();
    setIsRefreshing(false);

    if (!result.ok) {
      setLoadError(result.error.message);
      return;
    }

    applyFilters();
  };

  return (
    <div className="space-y-8">
      {/* Filtros */}
      <div className="flex items-end gap-3 flex-wrap">
        {turnos.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Turno</Label>
            <Select value={turnoId} onValueChange={handleTurnoChange}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Todos los turnos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos los turnos</SelectItem>
                {turnos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input
            type="date"
            className="w-40"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input
            type="date"
            className="w-40"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => applyFilters()}
          disabled={isPending}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          Aplicar filtros
        </Button>

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing || isPending}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refrescar vistas
        </Button>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-md">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {/* KPI cards */}
      <KpiCards data={cogs} />

      {/* COGS por turno */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">COGS por turno</h2>
        </div>
        <CogsTable data={cogs} />
      </section>

      {/* Consumo vs producción */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            Consumo vs producción por insumo
          </h2>
          {turnoId && (
            <span className="text-xs text-muted-foreground">
              — {turnos.find((t) => t.id === turnoId)?.nombre ?? ''}
            </span>
          )}
        </div>
        <ConsumoTable data={consumo} />
      </section>
    </div>
  );
}
