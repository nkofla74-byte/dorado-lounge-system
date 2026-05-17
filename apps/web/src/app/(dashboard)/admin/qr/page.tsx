import { assertCan } from '@/lib/auth/assertCan';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { QRGeneratorClient } from '@/components/qr/qr-generator-client';

export default async function QRGeneratorPage() {
  try {
    await assertCan('orders:create');
  } catch {
    redirect('/inventario');
  }

  const t = await getTranslations('qrAdmin');

  return (
    <div className="p-6 max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>
      <QRGeneratorClient />
    </div>
  );
}
