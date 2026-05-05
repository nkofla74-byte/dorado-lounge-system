export interface CogsPerPassenger {
  turnoId: string;
  turnoNombre: string;
  iniciadoAt: Date;
  cerradoAt: Date | null;
  totalPasajeros: number;
  cogsTotalCop: number;
  cogsPerPassenger: number | null;
}

export interface ConsumoInsumo {
  turnoId: string;
  turnoNombre: string;
  insumoId: string;
  insumoNombre: string;
  capa: string;
  unidadMedida: string;
  totalEntradas: number;
  totalConsumo: number;
  totalMerma: number;
  totalAjustes: number;
}

export interface AnalyticsFilters {
  turnoId?: string | undefined;
  desde?: string | undefined;
  hasta?: string | undefined;
}
