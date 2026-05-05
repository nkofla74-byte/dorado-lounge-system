export const UserRole = {
  superuser: 'superuser',
  admin: 'admin',
  chef: 'chef',
  sous_chef: 'sous_chef',
  mesero_amex: 'mesero_amex',
  personal_snack: 'personal_snack',
  personal_buffet: 'personal_buffet',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const CapaInventario = {
  capa_1: 'capa_1',
  capa_2: 'capa_2',
} as const;

export type CapaInventario = (typeof CapaInventario)[keyof typeof CapaInventario];

export const UnidadMedida = {
  kg: 'kg',
  g: 'g',
  l: 'l',
  ml: 'ml',
  unidad: 'unidad',
  porcion: 'porcion',
} as const;

export type UnidadMedida = (typeof UnidadMedida)[keyof typeof UnidadMedida];

export const TipoMovimiento = {
  entrada: 'entrada',
  salida_receta: 'salida_receta',
  merma: 'merma',
  ajuste: 'ajuste',
  conteo: 'conteo',
} as const;

export type TipoMovimiento = (typeof TipoMovimiento)[keyof typeof TipoMovimiento];

export const CategoriaMerma = {
  operativa: 'operativa',
  vencimiento: 'vencimiento',
  accidente: 'accidente',
  calidad: 'calidad',
  otro: 'otro',
} as const;

export type CategoriaMerma = (typeof CategoriaMerma)[keyof typeof CategoriaMerma];

export const TipoReceta = {
  produccion: 'produccion',
  servicio: 'servicio',
} as const;

export type TipoReceta = (typeof TipoReceta)[keyof typeof TipoReceta];

export const AreaProduccion = {
  cocina: 'cocina',
  pasteleria: 'pasteleria',
  amex: 'amex',
} as const;

export type AreaProduccion = (typeof AreaProduccion)[keyof typeof AreaProduccion];

export const ZonaServicio = {
  amex: 'amex',
  snack: 'snack',
  buffet: 'buffet',
} as const;

export type ZonaServicio = (typeof ZonaServicio)[keyof typeof ZonaServicio];

export const EstadoTanda = {
  planificada: 'planificada',
  en_proceso: 'en_proceso',
  completada: 'completada',
  cancelada: 'cancelada',
} as const;

export type EstadoTanda = (typeof EstadoTanda)[keyof typeof EstadoTanda];

export const EstadoPedido = {
  creado: 'creado',
  en_preparacion: 'en_preparacion',
  despachado: 'despachado',
  entregado: 'entregado',
  cancelado: 'cancelado',
} as const;

export type EstadoPedido = (typeof EstadoPedido)[keyof typeof EstadoPedido];

export const PEDIDO_TRANSITIONS: Record<EstadoPedido, EstadoPedido[]> = {
  creado: ['en_preparacion', 'cancelado'],
  en_preparacion: ['despachado', 'cancelado'],
  despachado: ['entregado'],
  entregado: [],
  cancelado: [],
};
