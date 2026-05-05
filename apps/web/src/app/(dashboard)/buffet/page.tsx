import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getDespachos, getTurnosActivos, getRecetasServicioBuffet } from '@/modules/buffet/actions';
import { BuffetPanel } from '@/components/buffet/buffet-panel';
import type { UserRole } from '@dorado/shared-types';

export const metadata: Metadata = {
  title: 'Buffet — Dorado Lounge',
};

export default async function BuffetPage() {
  const supabase = createClient();

  const [despachosResult, turnosResult, recetasResult, { data: authData }] = await Promise.all([
    getDespachos(),
    getTurnosActivos(),
    getRecetasServicioBuffet(),
    supabase.auth.getUser(),
  ]);

  const userRole = authData.user?.app_metadata?.role as UserRole | undefined;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Buffet</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Despacho de lotes y conciliación de tickets al cierre
        </p>
      </div>
      <BuffetPanel
        initialDespachos={despachosResult.ok ? despachosResult.value : []}
        recetas={recetasResult.ok ? recetasResult.value : []}
        turnos={turnosResult.ok ? turnosResult.value : []}
        userRole={userRole}
        error={despachosResult.ok ? undefined : despachosResult.error.message}
      />
    </div>
  );
}
