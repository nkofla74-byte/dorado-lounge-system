import type { ZonaServicio } from '@dorado/shared-types';

export interface AfluenciaIngreso {
  id: string;
  tenantId: string;
  turnoId: string;
  cantidad: number;
  zona: ZonaServicio | null;
  registradoPor: string | null;
  vueloNumero: string | null;
  ingresadoAt: Date;
  createdAt: Date;
}

export interface AfluenciaTurno {
  turnoId: string;
  turnoNombre: string;
  totalPasajeros: number;
  ingresos: AfluenciaIngreso[];
}

export interface RegistrarIngresoInput {
  turnoId: string;
  cantidad: number;
  zona?: ZonaServicio | null;
  vueloNumero?: string | null;
}

export class IngresoInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngresoInvalidoError';
  }
}

export function validarIngreso(input: RegistrarIngresoInput): void {
  if (!Number.isInteger(input.cantidad) || input.cantidad <= 0) {
    throw new IngresoInvalidoError(
      `La cantidad debe ser un entero positivo. Recibido: ${input.cantidad}`,
    );
  }
  if (input.vueloNumero !== undefined && input.vueloNumero !== null) {
    const limpio = input.vueloNumero.trim();
    if (limpio.length === 0 || limpio.length > 10) {
      throw new IngresoInvalidoError(
        'El número de vuelo debe tener entre 1 y 10 caracteres alfanuméricos',
      );
    }
  }
}
