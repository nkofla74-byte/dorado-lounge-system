import type {
  Insumo,
  InsumoWithStock,
  CreateInsumoInput,
  Lote,
  CreateLoteInput,
} from '../../domain/insumo';

export interface InsumoRepository {
  findAll(): Promise<InsumoWithStock[]>;
  create(tenantId: string, input: CreateInsumoInput): Promise<Insumo>;
  findLotesByInsumo(insumoId: string): Promise<Lote[]>;
  createLote(tenantId: string, input: CreateLoteInput): Promise<Lote>;
}
