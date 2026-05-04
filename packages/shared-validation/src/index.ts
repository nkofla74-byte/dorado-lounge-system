import { z } from 'zod';

// ── Primitivos ────────────────────────────────────────────────────────────────

export const uuidSchema = z.string().uuid({ message: 'ID inválido: debe ser UUID v4' });

export const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9_\-:.]+$/, 'Idempotency key solo puede contener [a-zA-Z0-9_-.:]');

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

// ── Enums de dominio ──────────────────────────────────────────────────────────

export const userRoleSchema = z.enum([
  'superuser',
  'admin',
  'chef',
  'sous_chef',
  'mesero_amex',
  'personal_snack',
  'personal_buffet',
]);

export const zonaServicioSchema = z.enum(['amex', 'snack', 'buffet']);

export const capaInventarioSchema = z.enum(['capa_1', 'capa_2']);

export const unidadMedidaSchema = z.enum(['kg', 'g', 'l', 'ml', 'unidad', 'porcion']);

export const tipoMovimientoSchema = z.enum([
  'entrada',
  'salida_receta',
  'merma',
  'ajuste',
  'conteo',
]);

export const categoriaMermaSchema = z.enum([
  'operativa',
  'vencimiento',
  'accidente',
  'calidad',
  'otro',
]);

export const estadoPedidoSchema = z.enum([
  'creado',
  'en_preparacion',
  'despachado',
  'entregado',
  'cancelado',
]);

export const estadoTandaSchema = z.enum(['planificada', 'en_proceso', 'completada', 'cancelada']);

export const tipoRecetaSchema = z.enum(['produccion', 'servicio']);

// ── Valores de dominio ────────────────────────────────────────────────────────

export const cantidadSchema = z
  .number({ invalid_type_error: 'Debe ser un número' })
  .positive({ message: 'La cantidad debe ser positiva' })
  .multipleOf(0.0001, { message: 'Máximo 4 decimales de precisión' });

export const coeficienteMermaSchema = z
  .number()
  .min(0, 'El coeficiente de merma no puede ser negativo')
  .max(0.9999, 'El coeficiente de merma debe ser menor que 1');

export const precioCopSchema = z
  .number()
  .positive('El precio debe ser positivo')
  .multipleOf(0.01, 'Máximo 2 decimales (COP)');

// ── Entidades de input (para validar en Server Actions) ───────────────────────

export const createInsumoSchema = z.object({
  nombre: z.string().min(1).max(255),
  codigo: z.string().max(50).optional(),
  capa: capaInventarioSchema,
  unidadMedida: unidadMedidaSchema,
  stockMinimo: z.number().min(0).default(0),
});

export const createLoteSchema = z.object({
  insumoId: uuidSchema,
  cantidadInicial: cantidadSchema,
  fechaVencimiento: z.string().date().optional(),
  proveedor: z.string().max(255).optional(),
  costoUnitario: precioCopSchema.optional(),
});

export const createRecetaSchema = z.discriminatedUnion('tipoReceta', [
  z.object({
    tipoReceta: z.literal('produccion'),
    nombre: z.string().min(1, 'El nombre es obligatorio').max(255),
    insumoDestinoId: uuidSchema,
    porciones: z.number().int().positive('Las porciones deben ser mayor que 0'),
  }),
  z.object({
    tipoReceta: z.literal('servicio'),
    nombre: z.string().min(1, 'El nombre es obligatorio').max(255),
    zona: zonaServicioSchema,
    porciones: z.number().int().positive('Las porciones deben ser mayor que 0'),
  }),
]);

export const addIngredienteSchema = z.object({
  recetaId: uuidSchema,
  insumoId: uuidSchema,
  cantidad: cantidadSchema,
  mermaCoeficiente: coeficienteMermaSchema.default(0),
});

export const createTandaSchema = z.object({
  recetaId: uuidSchema,
  cantidadTandas: z.number().int().positive('La cantidad de tandas debe ser mayor que 0'),
  notas: z.string().max(500).optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const transicionTandaSchema = z.object({
  tandaId: uuidSchema,
  estadoNuevo: estadoTandaSchema,
});

export const stockOutSchema = z.object({
  insumoId: uuidSchema,
  cantidad: cantidadSchema,
  turnoId: uuidSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const createPedidoSchema = z.object({
  zona: zonaServicioSchema,
  numeroMesa: z.string().max(20).optional(),
  notas: z.string().max(500).optional(),
  idempotencyKey: idempotencyKeySchema,
  items: z
    .array(
      z.object({
        recetaId: uuidSchema,
        cantidad: z.number().int().positive(),
        notas: z.string().max(255).optional(),
      }),
    )
    .min(1, 'Un pedido debe tener al menos un item'),
});

export const transicionPedidoSchema = z.object({
  pedidoId: uuidSchema,
  estadoNuevo: estadoPedidoSchema,
  version: z.number().int().positive(),
});

// ── Re-exports de tipos inferidos ─────────────────────────────────────────────

export type CreateInsumoInput = z.infer<typeof createInsumoSchema>;
export type CreateLoteInput = z.infer<typeof createLoteSchema>;
export type CreateRecetaInput = z.infer<typeof createRecetaSchema>;
export type AddIngredienteInput = z.infer<typeof addIngredienteSchema>;
export type CreateTandaInput = z.infer<typeof createTandaSchema>;
export type TransicionTandaInput = z.infer<typeof transicionTandaSchema>;
export type StockOutInput = z.infer<typeof stockOutSchema>;
export type CreatePedidoInput = z.infer<typeof createPedidoSchema>;
export type TransicionPedidoInput = z.infer<typeof transicionPedidoSchema>;
