export const UserRole = {
  superuser: 'superuser',
  admin: 'admin',
  chef: 'chef',
  chef_cocina_fria: 'chef_cocina_fria',
  chef_cocina_caliente: 'chef_cocina_caliente',
  sous_chef: 'sous_chef',
  mesero_amex: 'mesero_amex',
  personal_almacen: 'personal_almacen',
  personal_pasteleria: 'personal_pasteleria',
  steward: 'steward',
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
  lb: 'lb',
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
  // `cocina` es legacy: tras el split (refoco operacional 2026-05) las recetas
  // se clasifican como caliente o fría. Se conserva inerte para datos previos.
  cocina: 'cocina',
  cocina_caliente: 'cocina_caliente',
  cocina_fria: 'cocina_fria',
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

// Matriz autoritativa de ruteo: a qué áreas productivas puede solicitar
// producción cada zona de consumo. Un pedido se rutea POR PRODUCTO al área
// que indica su receta; un pedido puede tocar varias áreas.
// Regla: el área `amex` (cocina AMEX) sirve EXCLUSIVAMENTE a la zona AMEX.
export const ZONA_AREAS_PERMITIDAS: Record<ZonaServicio, AreaProduccion[]> = {
  amex: ['cocina_fria', 'amex'],
  snack: ['cocina_caliente', 'cocina_fria', 'pasteleria'],
  buffet: ['cocina_caliente', 'cocina_fria', 'pasteleria'],
};

export const Prioridad = {
  alta: 'alta',
  normal: 'normal',
  baja: 'baja',
} as const;

export type Prioridad = (typeof Prioridad)[keyof typeof Prioridad];

export const CategoriaMenu = {
  entrada: 'entrada',
  plato_fuerte: 'plato_fuerte',
  acompanante: 'acompanante',
} as const;

export type CategoriaMenu = (typeof CategoriaMenu)[keyof typeof CategoriaMenu];

export const TurnoBloque = {
  '6a2': '6a2',
  '2a10': '2a10',
  '10a6': '10a6',
} as const;

export type TurnoBloque = (typeof TurnoBloque)[keyof typeof TurnoBloque];

export const TURNO_BLOQUE_HORARIOS: Record<TurnoBloque, { inicio: number; fin: number }> = {
  '6a2': { inicio: 6, fin: 14 },
  '2a10': { inicio: 14, fin: 22 },
  '10a6': { inicio: 22, fin: 6 },
};

export const EstadoTanda = {
  planificada: 'planificada',
  en_proceso: 'en_proceso',
  completada: 'completada',
  cancelada: 'cancelada',
} as const;

export type EstadoTanda = (typeof EstadoTanda)[keyof typeof EstadoTanda];

export const EstadoPedido = {
  creado: 'creado',
  recibido_cocina: 'recibido_cocina',
  en_preparacion: 'en_preparacion',
  despachado: 'despachado',
  entregado: 'entregado',
  cancelado: 'cancelado',
} as const;

export type EstadoPedido = (typeof EstadoPedido)[keyof typeof EstadoPedido];

export const PEDIDO_TRANSITIONS: Record<EstadoPedido, EstadoPedido[]> = {
  creado: ['recibido_cocina', 'cancelado'],
  recibido_cocina: ['en_preparacion', 'cancelado'],
  en_preparacion: ['despachado', 'cancelado'],
  despachado: ['entregado'],
  entregado: [],
  cancelado: [],
};
