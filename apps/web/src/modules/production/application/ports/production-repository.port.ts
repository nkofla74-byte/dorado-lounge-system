import type {
  Tanda,
  TandaWithIngredientes,
  CreateTandaInput,
  EstadoTanda,
} from '../../domain/tanda';

export interface ProductionRepository {
  findAll(tenantId: string): Promise<Tanda[]>;
  create(tenantId: string, input: CreateTandaInput): Promise<Tanda>;
  findByIdWithIngredientes(id: string, tenantId: string): Promise<TandaWithIngredientes | null>;
  updateEstado(id: string, tenantId: string, estado: EstadoTanda): Promise<Tanda>;
}
