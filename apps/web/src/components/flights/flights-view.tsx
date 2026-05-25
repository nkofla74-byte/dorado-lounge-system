'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Activity, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FlightsBoard } from './flights-board';
import { FlightStatsPanel } from './flight-stats-panel';
import type { Flight } from '@/modules/flights/domain/flight';

interface FlightsViewProps {
  initialDepartures: Flight[];
  initialArrivals: Flight[];
  canViewStats: boolean;
}

type Tab = 'live' | 'stats';

export function FlightsView({
  initialDepartures,
  initialArrivals,
  canViewStats,
}: FlightsViewProps) {
  const t = useTranslations('admin.flights');
  const [tab, setTab] = useState<Tab>('live');

  return (
    <div className="space-y-4">
      {canViewStats && (
        <div className="flex gap-2 border-b">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTab('live')}
            className={cn(
              'gap-2 rounded-none border-b-2 -mb-px',
              tab === 'live' ? 'border-primary' : 'border-transparent',
            )}
          >
            <Activity className="h-4 w-4" />
            {t('tabLive')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTab('stats')}
            className={cn(
              'gap-2 rounded-none border-b-2 -mb-px',
              tab === 'stats' ? 'border-primary' : 'border-transparent',
            )}
          >
            <BarChart3 className="h-4 w-4" />
            {t('tabStats')}
          </Button>
        </div>
      )}

      {tab === 'live' ? (
        <FlightsBoard initialDepartures={initialDepartures} initialArrivals={initialArrivals} />
      ) : (
        <FlightStatsPanel />
      )}
    </div>
  );
}
