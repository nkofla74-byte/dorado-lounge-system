import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';

export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center p-6">
      <p className="text-6xl font-bold text-muted-foreground/30">404</p>
      <h2 className="text-title font-semibold">{t('notFound')}</h2>
      <Button asChild variant="outline" size="sm">
        <Link href="/inventario">{t('volverInicio')}</Link>
      </Button>
    </div>
  );
}
