import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { assertCan } from '@/lib/auth/assertCan';
import { getAuditLog, getAuditLogCount } from '@/modules/audit/actions';
import { AuditTable } from '@/components/audit/audit-table';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.audit');
  return { title: t('metaTitle') };
}

export default async function AuditoriaPage() {
  const t = await getTranslations('admin.audit');
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
        <h1 className="text-2xl font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>
      <AuditTable
        initialData={dataResult.ok ? dataResult.value : []}
        initialTotal={countResult.ok ? countResult.value : 0}
      />
    </div>
  );
}
