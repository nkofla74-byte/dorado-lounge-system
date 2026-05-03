import type { Insumo, InsumoWithStock, CreateInsumoInput } from '../../domain/insumo';

export interface InsumoRepository {
  findAll(): Promise<InsumoWithStock[]>;
  create(tenantId: string, input: CreateInsumoInput): Promise<Insumo>;
}
