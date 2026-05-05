import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getTurnos } from '@/modules/turnos/actions';
import { TurnosPanel } from '@/components/turnos/turnos-panel';
import type { UserRole } from '@dorado/shared-types';

export const metadata: Metadata = {
  title: 'Turnos — Dorado Lounge',
};

export default async function TurnosPage() {
  const supabase = createClient();

  const [turnosResult, { data: authData }] = await Promise.all([
    getTurnos(),
    supabase.auth.getUser(),
  ]);

  const userRole = authData.user?.app_metadata?.role as UserRole | undefined;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Turnos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestión de turnos operativos del lounge
        </p>
      </div>
      <TurnosPanel
        initialTurnos={turnosResult.ok ? turnosResult.value : []}
        userRole={userRole}
        error={turnosResult.ok ? undefined : turnosResult.error.message}
      />
    </div>
  );
}
