import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getMenuPublico } from './actions';
import { QRPassengerApp } from '@/components/qr/qr-passenger-app';

interface Props {
  params: { locale: string };
  searchParams: { t?: string };
}

export default async function QRPage({ params, searchParams }: Props) {
  const token = searchParams.t ?? '';
  const locale = params.locale;

  if (!token) {
    const t = await getTranslations({ locale, namespace: 'qr' });
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="space-y-2">
          <p className="text-lg font-semibold">{t('qrInvalido')}</p>
          <p className="text-sm text-muted-foreground">{t('qrInvalidoHint')}</p>
        </div>
      </div>
    );
  }

  const result = await getMenuPublico(token);
  if (!result.ok) notFound();

  const { recetas, mesa } = result.value;

  return <QRPassengerApp recetas={recetas} mesa={mesa} token={token} initialLocale={locale} />;
}
