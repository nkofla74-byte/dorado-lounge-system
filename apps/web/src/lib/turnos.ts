import type { TurnoBloque } from '@dorado/shared-types';

const BOGOTA_TZ = 'America/Bogota';

export function detectarBloqueActual(date: Date = new Date()): TurnoBloque {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: BOGOTA_TZ,
      hour: 'numeric',
      hour12: false,
    }).format(date),
  );
  if (hour >= 6 && hour < 14) return '6a2';
  if (hour >= 14 && hour < 22) return '2a10';
  return '10a6';
}

export function formatBloqueHorario(bloque: TurnoBloque): string {
  switch (bloque) {
    case '6a2':
      return '06:00 – 14:00';
    case '2a10':
      return '14:00 – 22:00';
    case '10a6':
      return '22:00 – 06:00';
  }
}
