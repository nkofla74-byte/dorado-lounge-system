import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getDespachos, getTurnosActivos, getStuartRequests } from '@/modules/snack/actions';
import { getInsumos } from '@/modules/inventory/actions';
import { SnackPanel } from '@/components/snack/snack-panel';
import type { UserRole } from '@dorado/shared-types';

export const metadata: Metadata = {
  title: 'Snack — Dorado Lounge',
};

export default async function SnackPage() {
  const supabase = createClient();

  const [despachosResult, turnosResult, stuartResult, insumosResult, { data: authData }] =
    await Promise.all([
      getDespachos(),
      getTurnosActivos(),
      getStuartRequests(),
      getInsumos(),
      supabase.auth.getUser(),
    ]);

  const userRole = authData.user?.app_metadata?.role as UserRole | undefined;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Snack</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Despachos de cocina, solicitudes Stuart y Stock Out
        </p>
      </div>
      <SnackPanel
        initialDespachos={despachosResult.ok ? despachosResult.value : []}
        initialStuart={stuartResult.ok ? stuartResult.value : []}
        turnos={turnosResult.ok ? turnosResult.value : []}
        insumos={insumosResult.ok ? insumosResult.value : []}
        userRole={userRole}
        error={despachosResult.ok ? undefined : despachosResult.error.message}
      />
    </div>
  );
}
