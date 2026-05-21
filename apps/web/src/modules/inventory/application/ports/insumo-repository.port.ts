import type {
  Insumo,
  InsumoWithStock,
  CreateInsumoInput,
  UpdateInsumoInput,
  Lote,
  CreateLoteInput,
} from '../../domain/insumo';

export interface InsumoRepository {
  findAll(): Promise<InsumoWithStock[]>;
  create(tenantId: string, input: CreateInsumoInput): Promise<Insumo>;
  update(tenantId: string, input: UpdateInsumoInput): Promise<Insumo>;
  findLotesByInsumo(insumoId: string): Promise<Lote[]>;
  createLote(tenantId: string, input: CreateLoteInput): Promise<Lote>;
}
