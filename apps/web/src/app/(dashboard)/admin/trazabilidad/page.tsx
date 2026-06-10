import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getTrazabilidadPedidos } from '@/modules/orders/actions';
import { TrazabilidadPanel } from '@/components/admin/trazabilidad-panel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('trazabilidad');
  return { title: t('metaTitle') };
}

export default async function TrazabilidadPage() {
  const t = await getTranslations('trazabilidad');
  const res = await getTrazabilidadPedidos({ limit: 50 });
  const pedidos = res.ok ? res.value : [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>
      <TrazabilidadPanel initial={pedidos} />
    </div>
  );
}
