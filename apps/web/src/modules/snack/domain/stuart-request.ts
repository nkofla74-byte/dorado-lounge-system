export interface StuartRequest {
  id: string;
  tenantId: string;
  canal: string;
  remitenteId: string;
  descripcion: string;
  createdAt: Date;
}

export interface CreateStuartInput {
  descripcion: string;
}
