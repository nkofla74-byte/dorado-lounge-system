export interface ConsumoInsumo {
  tenantId: string;
  tenantNombre: string | null;
  tenantSlug: string | null;
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
