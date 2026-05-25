/**
 * Parser for ICAO 9303 Machine Readable Zone — TD3 (passport, 2 × 44 chars).
 *
 * Line 1 positions:
 *  0       Document type ('P')
 *  1       Document subtype or '<'
 *  2-4     Issuing state (ICAO 3-letter)
 *  5-43    Name field (LASTNAME<<FIRSTNAME<MIDDLENAME<...)
 *
 * Line 2 positions:
 *  0-8     Document number (9 chars)
 *  9       Check digit
 *  10-12   Nationality (ICAO 3-letter)
 *  13-18   Date of birth (YYMMDD)
 *  19      Check digit (DOB)
 *  20      Sex ('M', 'F', or '<' = unspecified)
 *  21-26   Expiry date (YYMMDD)
 *  27      Check digit (expiry)
 *  28-41   Optional data
 *  42      Check digit (optional)
 *  43      Overall check digit
 */

export interface MrzData {
  nombrePasajero: string;
  documentoNumero: string;
  documentoTipo: 'pasaporte';
  fechaNacimiento: string; // ISO date YYYY-MM-DD
  sexo: 'M' | 'F' | 'X';
  paisOrigen: string; // ICAO 3-letter nationality code
}

function mrzSex(char: string): 'M' | 'F' | 'X' {
  if (char === 'M') return 'M';
  if (char === 'F') return 'F';
  return 'X';
}

function mrzDateToISO(yymmdd: string): string {
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  // Birth year: if yy > (current 2-digit year + 10), person was born in 1900s
  const threshold = (new Date().getFullYear() % 100) + 10;
  const year = yy > threshold ? 1900 + yy : 2000 + yy;
  return `${year}-${mm}-${dd}`;
}

function mrzName(nameField: string): string {
  const doubleLt = nameField.indexOf('<<');
  if (doubleLt === -1) return nameField.replace(/</g, ' ').trim();
  const last = nameField.slice(0, doubleLt).replace(/</g, ' ').trim();
  const first = nameField
    .slice(doubleLt + 2)
    .replace(/</g, ' ')
    .trim();
  return first ? `${first} ${last}` : last;
}

export function parseMrz(raw: string): MrzData | null {
  const lines = raw
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length === 44);

  if (lines.length < 2) return null;
  const [line1, line2] = lines as [string, string];

  if (line1[0] !== 'P') return null;

  const nationality = line2.slice(10, 13).replace(/</g, '');
  const dobRaw = line2.slice(13, 19);
  if (!/^\d{6}$/.test(dobRaw)) return null;

  return {
    nombrePasajero: mrzName(line1.slice(5, 44)),
    documentoNumero: line2.slice(0, 9).replace(/</g, ''),
    documentoTipo: 'pasaporte',
    fechaNacimiento: mrzDateToISO(dobRaw),
    sexo: mrzSex(line2[20] ?? '<'),
    paisOrigen: nationality || line1.slice(2, 5).replace(/</g, ''),
  };
}
