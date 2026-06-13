import type {
  Requisicion,
  RequisicionWithItems,
  CreateRequisicionInput,
  DespachoItemInput,
  EstadoRequisicion,
  AreaSolicitante,
} from '../../domain/requisicion';

export interface RequisicionRepository {
  create(
    tenantId: string,
    userId: string,
    input: CreateRequisicionInput,
  ): Promise<RequisicionWithItems>;
  findById(id: string, tenantId: string): Promise<RequisicionWithItems | null>;
  /** Cola del almacén: requisiciones activas (no recibidas/canceladas) del tenant. */
  findColaAlmacen(tenantId: string): Promise<RequisicionWithItems[]>;
  /** Requisiciones de un área (historial del KDS que las origina). */
  findByArea(tenantId: string, area: AreaSolicitante): Promise<RequisicionWithItems[]>;
  /** Transición de estado con optimistic locking. Registra el evento append-only. */
  transition(
    id: string,
    tenantId: string,
    actorId: string,
    estado: EstadoRequisicion,
    version: number,
  ): Promise<Requisicion>;
  /** Despacho (parcial o total): actualiza cantidades + transición a `despachada`. */
  despachar(
    id: string,
    tenantId: string,
    actorId: string,
    items: DespachoItemInput[],
    version: number,
  ): Promise<Requisicion>;
}
