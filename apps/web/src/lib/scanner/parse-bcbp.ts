/**
 * Parser for IATA BCBP (Bar Coded Boarding Pass) format — Resolution 792.
 * Handles the mandatory unique section (58 chars, first leg only).
 *
 * Positions (0-indexed):
 *  0       Format code ('M')
 *  1       Number of legs
 *  2-21    Passenger name (20 chars, LASTNAME/FIRSTNAME)
 *  22      Electronic ticket indicator
 *  23-29   Operating carrier PNR (7 chars)
 *  30-32   From city IATA code
 *  33-35   To city IATA code
 *  36-38   Operating carrier designator
 *  39-43   Flight number (5 chars, zero-padded)
 *  44-46   Date of flight (Julian day, 3 digits)
 *  47      Compartment code
 *  48-51   Seat number
 *  52-56   Check-in sequence number
 *  57      Passenger status
 */

export interface BcbpData {
  nombrePasajero: string;
  origen: string;
  destino: string;
  aerolinea: string;
  vueloNumero: string;
  asiento: string;
  fechaVuelo: string | null; // ISO date, best-effort from Julian day
}

function julianToISO(julianStr: string): string | null {
  const day = parseInt(julianStr.trim(), 10);
  if (isNaN(day) || day < 1 || day > 366) return null;
  const year = new Date().getFullYear();
  const dt = new Date(year, 0);
  dt.setDate(day);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function formatName(raw: string): string {
  const s = raw.trim();
  const slash = s.indexOf('/');
  if (slash === -1) return s;
  const last = s.slice(0, slash).trim();
  const first = s
    .slice(slash + 1)
    .replace(/\s+/g, ' ')
    .trim();
  return first ? `${first} ${last}` : last;
}

export function parseBcbp(raw: string): BcbpData | null {
  const s = raw.replace(/\r/g, '').trim();
  if (s[0] !== 'M' || s.length < 58) return null;

  const carrier = s.slice(36, 39).trim();
  const flightDigits = s.slice(39, 44).trim().replace(/^0+/, '');

  return {
    nombrePasajero: formatName(s.slice(2, 22)),
    origen: s.slice(30, 33).trim(),
    destino: s.slice(33, 36).trim(),
    aerolinea: carrier,
    vueloNumero: carrier + flightDigits,
    asiento: s.slice(48, 52).trim(),
    fechaVuelo: julianToISO(s.slice(44, 47)),
  };
}
