import { AfluenciaPanel } from '@/components/afluencia/afluencia-panel';
import { getTurnoActivo } from '@/modules/turnos/actions';

export default async function AfluenciaPage() {
  const turnoResult = await getTurnoActivo();
  const turnoActivo = turnoResult.ok && turnoResult.value ? turnoResult.value : null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Afluencia de pasajeros</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registra los ingresos al lounge por turno para calcular el COGS por pasajero
        </p>
      </div>

      <AfluenciaPanel
        turnoActivo={turnoActivo ? { id: turnoActivo.id, nombre: turnoActivo.nombre } : null}
      />
    </div>
  );
}
