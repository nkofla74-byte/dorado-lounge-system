'use client';

import { useCallback, useRef } from 'react';
import { parseBcbp } from './parse-bcbp';
import { parseMrz } from './parse-mrz';
import { parseCedulaCo } from './parse-cedula-co';

export type DocumentType = 'bcbp' | 'mrz' | 'cedula_co' | 'unknown';

export interface ScanResult {
  type: DocumentType;
  // Identity / travel document fields
  nombrePasajero?: string;
  documentoTipo?: string;
  documentoNumero?: string;
  fechaNacimiento?: string | null; // ISO date YYYY-MM-DD
  sexo?: 'M' | 'F' | 'X';
  paisOrigen?: string; // ICAO-3 country code
  // Flight fields (BCBP only)
  origen?: string;
  destino?: string;
  aerolinea?: string;
  vueloNumero?: string;
  asiento?: string;
  fechaVuelo?: string | null;
}

const MIN_SCAN_LENGTH = 20;

function detect(raw: string): ScanResult {
  const s = raw.trim();

  // Boarding pass (BCBP): starts with 'M', ≥ 58 chars
  if (s[0] === 'M' && s.length >= 58) {
    const bcbp = parseBcbp(s);
    if (bcbp) return { type: 'bcbp', ...bcbp };
  }

  // Passport MRZ TD3: two lines of 44 chars
  const lines44 = s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length === 44);
  if (lines44.length >= 2) {
    const mrz = parseMrz(s);
    if (mrz) return { type: 'mrz', ...mrz };
  }

  // Colombian cédula PDF417
  const cedula = parseCedulaCo(s);
  if (cedula) return { type: 'cedula_co', ...cedula };

  return { type: 'unknown' };
}

/**
 * Hook for USB barcode/MRZ scanner input (keyboard emulator mode).
 *
 * Attach `inputRef` to a dedicated <input> element. The scanner sends all
 * characters as rapid keystrokes ending with Enter. When Enter fires, the
 * accumulated value is parsed and `onScan` is called.
 *
 * The operator clicks the scan input to focus it, scans the document, and
 * the form fields populate automatically.
 */
export function useDocumentScanner(onScan: (result: ScanResult) => void) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const val = (e.target as HTMLInputElement).value;
      if (val.trim().length >= MIN_SCAN_LENGTH) {
        onScan(detect(val));
      }
      if (inputRef.current) inputRef.current.value = '';
    },
    [onScan],
  );

  return { inputRef, handleKeyDown };
}
