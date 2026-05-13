import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getFlights } from '@/modules/flights/actions';
import { FlightsBoard } from '@/components/flights/flights-board';
import { Plane } from 'lucide-react';
import type { UserRole } from '@dorado/shared-types';

const ALLOWED_ROLES: UserRole[] = ['admin', 'chef', 'sous_chef', 'mesero_amex', 'recepcion'];

export default async function VuelosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = user?.app_metadata?.role as UserRole | undefined;
  if (!role || !ALLOWED_ROLES.includes(role)) redirect('/');

  const [departuresResult, arrivalsResult] = await Promise.all([
    getFlights('departure'),
    getFlights('arrival'),
  ]);

  const departures = departuresResult.ok ? departuresResult.value : [];
  const arrivals = arrivalsResult.ok ? arrivalsResult.value : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start gap-3">
        <Plane className="h-7 w-7 mt-0.5 text-primary shrink-0" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vuelos El Dorado</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Salidas y llegadas del Aeropuerto Internacional El Dorado · BOG · Bogotá, Colombia
          </p>
        </div>
      </div>

      <FlightsBoard initialDepartures={departures} initialArrivals={arrivals} />
    </div>
  );
}
