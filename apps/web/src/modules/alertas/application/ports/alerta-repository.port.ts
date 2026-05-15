import type { Alerta, CreateAlertaInput } from '../../domain/alerta';

export interface AlertaRepository {
  findRecent(tenantId: string, limit?: number): Promise<Alerta[]>;
  findAll(tenantId: string, limit?: number): Promise<Alerta[]>;
  countUnread(tenantId: string): Promise<number>;
  create(tenantId: string, input: CreateAlertaInput): Promise<Alerta>;
  marcarLeida(id: string, tenantId: string, userId: string): Promise<void>;
  marcarTodasLeidas(tenantId: string, userId: string): Promise<void>;
}
