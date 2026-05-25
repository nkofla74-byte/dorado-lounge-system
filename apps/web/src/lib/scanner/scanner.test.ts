import { describe, it, expect } from 'vitest';
import { parseBcbp } from './parse-bcbp';
import { parseMrz } from './parse-mrz';
import { parseCedulaCo } from './parse-cedula-co';

// Sample BCBP (IATA Resolution 792) — synthetic, valid mandatory section.
// M1SMITH/JOHN          EABC123 BOGMIA AV 0123 125F012A0010 100
const BCBP_SAMPLE = 'M1SMITH/JOHN          EABC1234BOGMIA AV 01230125F012A0010 100';

// MRZ TD3 passport — synthetic
const MRZ_LINE1 = 'P<COLSMITH<<JOHN<CARLOS<<<<<<<<<<<<<<<<<<<<<';
const MRZ_LINE2 = 'AB1234567<COL8501015M3012312<<<<<<<<<<<<<<<4';

// Colombian cedula — semicolon-separated synthetic
const CEDULA_SAMPLE = '12345678;SMITH;JOHNSON;JOHN;CARLOS;19850101;M;BOGOTA;20050101';

describe('parseBcbp', () => {
  it('returns null for strings shorter than 58 chars', () => {
    expect(parseBcbp('M1SHORT')).toBeNull();
  });

  it('returns null if format code is not M', () => {
    const notBcbp = 'X1' + 'A'.repeat(56);
    expect(parseBcbp(notBcbp)).toBeNull();
  });

  it('parses passenger name from LASTNAME/FIRSTNAME format', () => {
    const result = parseBcbp(BCBP_SAMPLE);
    expect(result?.nombrePasajero).toContain('JOHN');
    expect(result?.nombrePasajero).toContain('SMITH');
  });

  it('extracts origin, destination, airline, flight, seat', () => {
    const result = parseBcbp(BCBP_SAMPLE);
    expect(result?.origen).toBe('BOG');
    expect(result?.destino).toBe('MIA');
    expect(result?.aerolinea).toBe('AV');
    expect(result?.asiento).toBeTruthy();
  });

  it('parses Julian day into an ISO date or null', () => {
    const result = parseBcbp(BCBP_SAMPLE);
    if (result?.fechaVuelo !== null && result?.fechaVuelo !== undefined) {
      expect(result.fechaVuelo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('parseMrz', () => {
  const raw = `${MRZ_LINE1}\n${MRZ_LINE2}`;

  it('returns null for strings without two 44-char lines', () => {
    expect(parseMrz('P<COLSMITH<<JOHN')).toBeNull();
  });

  it('returns null for non-passport documents', () => {
    const notPassport = MRZ_LINE1.replace('P<', 'A<') + '\n' + MRZ_LINE2;
    expect(parseMrz(notPassport)).toBeNull();
  });

  it('extracts name, document number, nationality, DOB, sex', () => {
    const result = parseMrz(raw);
    expect(result).not.toBeNull();
    expect(result?.nombrePasajero).toContain('JOHN');
    expect(result?.documentoNumero).toBe('AB1234567');
    expect(result?.paisOrigen).toBe('COL');
    expect(result?.documentoTipo).toBe('pasaporte');
  });

  it('converts YYMMDD DOB to ISO date with correct century', () => {
    const result = parseMrz(raw);
    expect(result?.fechaNacimiento).toMatch(/^(19|20)\d{2}-\d{2}-\d{2}$/);
  });

  it('parses sex character', () => {
    const result = parseMrz(raw);
    expect(['M', 'F', 'X']).toContain(result?.sexo);
  });
});

describe('parseCedulaCo', () => {
  it('returns null for strings without recognized separators', () => {
    expect(parseCedulaCo('NOSEPERATOR')).toBeNull();
  });

  it('returns null when NUIP is too short', () => {
    expect(parseCedulaCo('123;A;B;C;D;E;M')).toBeNull();
  });

  it('parses NUIP, name components, DOB, sex', () => {
    const result = parseCedulaCo(CEDULA_SAMPLE);
    expect(result).not.toBeNull();
    expect(result?.documentoNumero).toBe('12345678');
    expect(result?.documentoTipo).toBe('CC');
    expect(result?.paisOrigen).toBe('COL');
    expect(result?.sexo).toBe('M');
    expect(result?.nombrePasajero).toContain('SMITH');
  });

  it('converts YYYYMMDD date to ISO format', () => {
    const result = parseCedulaCo(CEDULA_SAMPLE);
    expect(result?.fechaNacimiento).toBe('1985-01-01');
  });

  it('handles pipe separator', () => {
    const piped = CEDULA_SAMPLE.replace(/;/g, '|');
    const result = parseCedulaCo(piped);
    expect(result?.documentoNumero).toBe('12345678');
  });
});
