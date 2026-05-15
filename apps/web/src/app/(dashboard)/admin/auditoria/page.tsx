import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { assertCan } from '@/lib/auth/assertCan';
import { getAuditLog, getAuditLogCount } from '@/modules/audit/actions';
import { AuditTable } from '@/components/audit/audit-table';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Auditoría — Dorado Lounge',
};

export default async function AuditoriaPage() {
  try {
    await assertCan('audit:read');
  } catch {
    redirect('/inventario');
  }

  const [dataResult, countResult] = await Promise.all([
    getAuditLog({ limit: 100 }),
    getAuditLogCount(),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoría</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registro inmutable de todas las operaciones con hash chain SHA-256. Haz clic en una fila
          para ver el payload completo.
        </p>
      </div>
      <AuditTable
        initialData={dataResult.ok ? dataResult.value : []}
        initialTotal={countResult.ok ? countResult.value : 0}
      />
    </div>
  );
}
