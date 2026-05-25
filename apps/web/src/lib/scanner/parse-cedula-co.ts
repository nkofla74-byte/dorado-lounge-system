/**
 * Best-effort parser for Colombian Cédula de Ciudadanía PDF417 barcode.
 * The Registraduría Nacional format is not publicly documented; this parser
 * covers the most common field order found in post-2015 cedulas:
 *
 *   NUIP ; Apellido1 ; Apellido2 ; Nombre1 ; Nombre2 ; FechaNac ; Sexo ; Lugar ; FechaExp
 *
 * Field separator: ';', '|', 0x1F (ASCII 31), or 0x1E (ASCII 30).
 * Date formats: YYYYMMDD, DD/MM/YYYY, YYYY-MM-DD.
 */

export interface CedulaCoData {
  nombrePasajero: string;
  documentoNumero: string;
  documentoTipo: 'CC';
  fechaNacimiento: string | null; // ISO date or null if unparseable
  sexo: 'M' | 'F' | 'X';
  paisOrigen: 'COL';
}

const SEPARATORS = [';', '\x1F', '|', '\x1E'];

function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  const dmyMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return s;
  return null;
}

function parseSex(raw: string): 'M' | 'F' | 'X' {
  const s = raw.trim().toUpperCase();
  if (s === 'M' || s === 'MASCULINO') return 'M';
  if (s === 'F' || s === 'FEMENINO') return 'F';
  return 'X';
}

export function parseCedulaCo(raw: string): CedulaCoData | null {
  const s = raw.replace(/\r/g, '').trim();

  for (const sep of SEPARATORS) {
    if (!s.includes(sep)) continue;
    const parts = s.split(sep);
    if (parts.length < 6) continue;

    const nuip = (parts[0] ?? '').replace(/\D/g, '');
    if (!nuip || nuip.length < 5) continue;

    const apellido1 = (parts[1] ?? '').trim();
    const apellido2 = (parts[2] ?? '').trim();
    const nombre1 = (parts[3] ?? '').trim();
    const nombre2 = (parts[4] ?? '').trim();
    const fechaRaw = (parts[5] ?? '').trim();
    const sexoRaw = (parts[6] ?? '').trim();

    const fullName = [nombre1, nombre2, apellido1, apellido2].filter(Boolean).join(' ').trim();

    if (!fullName) continue;

    return {
      nombrePasajero: fullName,
      documentoNumero: nuip,
      documentoTipo: 'CC',
      fechaNacimiento: parseDate(fechaRaw),
      sexo: parseSex(sexoRaw),
      paisOrigen: 'COL',
    };
  }

  return null;
}
