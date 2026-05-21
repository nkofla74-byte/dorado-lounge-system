import type { Alerta, CreateAlertaInput } from '../../domain/alerta';

// tenantId=null → operación sin filtro (vista global / acción cross-tenant,
// solo para superuser; la validación de rol ocurre en la action).
export interface AlertaRepository {
  findRecent(tenantId: string | null, limit?: number): Promise<Alerta[]>;
  findAll(tenantId: string | null, limit?: number): Promise<Alerta[]>;
  countUnread(tenantId: string | null): Promise<number>;
  create(tenantId: string, input: CreateAlertaInput): Promise<Alerta>;
  marcarLeida(id: string, tenantId: string | null, userId: string): Promise<void>;
  marcarTodasLeidas(tenantId: string | null, userId: string): Promise<void>;
}
