'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Users, TrendingDown, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CogsPerPassenger } from '@/modules/analytics/domain/kpi';

interface KpiCardsProps {
  data: CogsPerPassenger[];
}

export function KpiCards({ data }: KpiCardsProps) {
  const t = useTranslations('analytics');
  const locale = useLocale();

  const formatCop = (value: number): string =>
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const totalPasajeros = data.reduce((acc, r) => acc + r.totalPasajeros, 0);
  const cogsTotalCop = data.reduce((acc, r) => acc + r.cogsTotalCop, 0);
  const cogsPerPassengerAvg = totalPasajeros > 0 ? cogsTotalCop / totalPasajeros : null;

  const kpis = [
    {
      title: t('kpiTotalPasajeros'),
      value: totalPasajeros.toLocaleString(locale === 'en' ? 'en-US' : 'es-CO'),
      icon: Users,
      desc: t('kpiTotalPasajerosDesc'),
    },
    {
      title: t('kpiCogsTotal'),
      value: formatCop(cogsTotalCop),
      icon: DollarSign,
      desc: t('kpiCogsTotalDesc'),
    },
    {
      title: t('kpiCogsPorPasajero'),
      value: cogsPerPassengerAvg !== null ? formatCop(cogsPerPassengerAvg) : '—',
      icon: TrendingDown,
      desc: t('kpiCogsPorPasajeroDesc'),
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {kpis.map((kpi) => (
        <Card key={kpi.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
            <kpi.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{kpi.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{kpi.desc}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
