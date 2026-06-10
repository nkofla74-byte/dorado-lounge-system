export interface TrazaFiltros {
  desde?: string;
  hasta?: string;
  zona?: string;
  estado?: string;
  responsableId?: string;
  mesa?: string;
  limit?: number;
  offset?: number;
}

export interface TrazaPedidoSummary {
  pedidoId: string;
  zona: string;
  numeroMesa: string | null;
  estado: string;
  responsableNombre: string | null;
  cantidadItems: number;
  createdAt: string;
}

export interface TrazaPedidoDetalle {
  pedidoId: string;
  zona: string;
  numeroMesa: string | null;
  estado: string;
  creadoPor: string | null;
  cocineroId: string | null;
  createdAt: string;
  timeline: Array<{
    tipo: 'pedido' | 'item';
    estado: string;
    actorNombre: string | null;
    at: string;
    itemNombre?: string | undefined;
  }>;
}
