export interface DespachoBuffet {
  id: string;
  tenantId: string;
  recetaId: string;
  recetaNombre: string;
  turnoId: string | null;
  cantidad: number;
  responsableId: string | null;
  idempotencyKey: string | null;
  despachadoAt: Date;
  createdAt: Date;
}

export interface DespachoIngrediente {
  insumoId: string;
  insumoNombre: string;
  cantidadPorBatch: number;
  mermaCoeficiente: number;
}

export interface RecetaServicioBuffet {
  id: string;
  nombre: string;
  porciones: number;
  ingredientes: DespachoIngrediente[];
}

export interface CreateDespachoBuffetInput {
  recetaId: string;
  cantidad: number;
  turnoId?: string | null;
  idempotencyKey: string;
}
