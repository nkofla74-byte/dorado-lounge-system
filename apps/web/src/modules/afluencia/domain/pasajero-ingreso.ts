import type { ZonaServicio } from '@dorado/shared-types';

export const TIPOS_ACCESO = [
  'amex',
  'priority_pass',
  'diners',
  'cortesia',
  'corporativo',
  'otro',
] as const;

export type TipoAcceso = (typeof TIPOS_ACCESO)[number];

export interface PasajeroIngreso {
  id: string;
  tenantId: string;
  turnoId: string;
  nombrePasajero: string;
  documentoTipo: string | null;
  documentoNumero: string | null;
  vueloNumero: string | null;
  aerolinea: string | null;
  destino: string | null;
  horaVuelo: Date | null;
  asiento: string | null;
  gate: string | null;
  tipoAcceso: TipoAcceso;
  tarjetaUltimos4: string | null;
  acompanantes: number;
  zona: ZonaServicio | null;
  sexo: 'M' | 'F' | 'X' | null;
  fechaNacimiento: Date | null;
  paisOrigen: string | null;
  registradoPor: string;
  ingresadoAt: Date;
  notas: string | null;
  createdAt: Date;
}

export interface RegistrarPasajeroInput {
  turnoId: string;
  nombrePasajero: string;
  documentoTipo?: string | null | undefined;
  documentoNumero?: string | null | undefined;
  vueloNumero?: string | null | undefined;
  aerolinea?: string | null | undefined;
  destino?: string | null | undefined;
  horaVuelo?: string | null | undefined;
  asiento?: string | null | undefined;
  gate?: string | null | undefined;
  tipoAcceso: TipoAcceso;
  tarjetaUltimos4?: string | null | undefined;
  acompanantes?: number | undefined;
  zona?: ZonaServicio | null | undefined;
  sexo?: 'M' | 'F' | 'X' | null | undefined;
  fechaNacimiento?: string | null | undefined; // ISO date YYYY-MM-DD
  paisOrigen?: string | null | undefined;
  notas?: string | null | undefined;
}

export class PasajeroInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasajeroInvalidoError';
  }
}

export function validarPasajeroIngreso(input: RegistrarPasajeroInput): void {
  if (!input.nombrePasajero.trim()) {
    throw new PasajeroInvalidoError('El nombre del pasajero es obligatorio');
  }
  if (!TIPOS_ACCESO.includes(input.tipoAcceso)) {
    throw new PasajeroInvalidoError(`Tipo de acceso inválido: ${input.tipoAcceso}`);
  }
  if (
    input.acompanantes !== undefined &&
    (input.acompanantes < 0 || !Number.isInteger(input.acompanantes))
  ) {
    throw new PasajeroInvalidoError('Acompañantes debe ser un entero >= 0');
  }
  if (input.tarjetaUltimos4 && !/^\d{4}$/.test(input.tarjetaUltimos4)) {
    throw new PasajeroInvalidoError('Últimos 4 dígitos debe ser exactamente 4 números');
  }
}
