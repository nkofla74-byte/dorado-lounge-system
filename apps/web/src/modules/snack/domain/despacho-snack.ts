export interface DespachoSnack {
  id: string;
  tenantId: string;
  recetaId: string;
  recetaNombre: string;
  turnoId: string | null;
  cantidad: number;
  responsableId: string | null;
  despachadoAt: Date;
  createdAt: Date;
}

export interface TurnoActivo {
  id: string;
  nombre: string;
  activo: boolean;
  iniciadoAt: Date;
}
