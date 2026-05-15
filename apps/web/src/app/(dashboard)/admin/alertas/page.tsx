import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { assertCan } from '@/lib/auth/assertCan';
import { getAlertasAdmin } from '@/modules/alertas/actions';
import { AlertasAdminPanel } from '@/components/alertas/alertas-admin-panel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Alertas — Dorado Lounge',
};

export default async function AlertasAdminPage() {
  try {
    await assertCan('alertas:write');
  } catch {
    redirect('/inventario');
  }

  const result = await getAlertasAdmin();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Historial completo de alertas operativas. Ejecuta verificaciones manuales de vencimientos
          y demoras.
        </p>
      </div>
      <AlertasAdminPanel initialData={result.ok ? result.value : []} />
    </div>
  );
}
