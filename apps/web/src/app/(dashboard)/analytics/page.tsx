import type { Metadata } from 'next';
import { fetchCogsPerPassenger, fetchConsumoVsProduccion } from '@/modules/analytics/actions';
import { getTurnos } from '@/modules/turnos/actions';
import { AnalyticsPanel } from '@/components/analytics/analytics-panel';

export const metadata: Metadata = {
  title: 'Analytics — Dorado Lounge',
};

export default async function AnalyticsPage() {
  const [cogsResult, consumoResult, turnosResult] = await Promise.all([
    fetchCogsPerPassenger(),
    fetchConsumoVsProduccion(),
    getTurnos(),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          COGS por pasajero y consumo vs producción por turno
        </p>
      </div>
      <AnalyticsPanel
        initialCogs={cogsResult.ok ? cogsResult.value : []}
        initialConsumo={consumoResult.ok ? consumoResult.value : []}
        turnos={turnosResult.ok ? turnosResult.value : []}
        error={cogsResult.ok ? undefined : cogsResult.error.message}
      />
    </div>
  );
}
