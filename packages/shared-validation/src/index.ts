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
  'chef_cocina_fria',
  'chef_cocina_caliente',
  'sous_chef',
  'mesero_amex',
  'personal_almacen',
  'personal_pasteleria',
  'steward',
]);

export const zonaServicioSchema = z.enum(['amex', 'snack', 'buffet']);

export const capaInventarioSchema = z.enum(['capa_1', 'capa_2']);

// Refoco operacional (F2): unidades canónicas {g, ml, unidad}.
export const unidadMedidaSchema = z.enum(['g', 'ml', 'unidad']);

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
  'recibido_cocina',
  'en_preparacion',
  'despachado',
  'entregado',
  'cancelado',
]);

export const estadoTandaSchema = z.enum(['planificada', 'en_proceso', 'completada', 'cancelada']);

export const tipoRecetaSchema = z.enum(['produccion', 'servicio']);

export const categoriaMenuSchema = z.enum(['entrada', 'plato_fuerte', 'acompanante', 'postre']);

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
  mermaDefault: coeficienteMermaSchema.default(0),
});

export const updateInsumoSchema = z.object({
  id: uuidSchema,
  nombre: z.string().min(1).max(255),
  stockMinimo: z.number().min(0),
  mermaDefault: coeficienteMermaSchema,
});

export const createLoteSchema = z
  .object({
    insumoId: uuidSchema,
    cantidadInicial: cantidadSchema,
    fechaVencimiento: z.string().date().optional(),
    proveedor: z.string().max(255).optional(),
    proveedorId: uuidSchema.optional(),
    costoUnitario: precioCopSchema.optional(),
    cantidadEmpaques: z
      .number()
      .int()
      .positive('La cantidad de empaques debe ser mayor que 0')
      .optional(),
    pesoUnitario: cantidadSchema.optional(),
    unidadPeso: unidadMedidaSchema.optional(),
  })
  .refine(
    (v) => {
      const hasEmpaques = v.cantidadEmpaques !== undefined;
      const hasPeso = v.pesoUnitario !== undefined;
      const hasUnidadPeso = v.unidadPeso !== undefined;
      return (
        (hasEmpaques && hasPeso && hasUnidadPeso) || (!hasEmpaques && !hasPeso && !hasUnidadPeso)
      );
    },
    {
      message: 'cantidadEmpaques, pesoUnitario y unidadPeso deben venir juntos o ninguno',
      path: ['cantidadEmpaques'],
    },
  );

// Item de ingrediente inline al crear/editar receta — separado del schema
// addIngredienteSchema (que requiere recetaId) porque acá la receta aún no existe.
export const recetaIngredienteInputSchema = z.object({
  insumoId: uuidSchema,
  cantidad: cantidadSchema,
  unidad: unidadMedidaSchema.optional(),
  mermaCoeficiente: coeficienteMermaSchema.default(0),
});

export const createRecetaSchema = z.discriminatedUnion('tipoReceta', [
  z.object({
    tipoReceta: z.literal('produccion'),
    nombre: z.string().min(1, 'El nombre es obligatorio').max(255),
    insumoDestinoId: uuidSchema,
    porciones: z.number().int().positive('Las porciones deben ser mayor que 0'),
    descripcion: z.string().max(500).optional().nullable(),
    ingredientes: z.array(recetaIngredienteInputSchema).optional(),
  }),
  z.object({
    tipoReceta: z.literal('servicio'),
    nombre: z.string().min(1, 'El nombre es obligatorio').max(255),
    zona: zonaServicioSchema,
    porciones: z.number().int().positive('Las porciones deben ser mayor que 0'),
    descripcion: z.string().max(500).optional().nullable(),
    categoriaMenu: categoriaMenuSchema.optional().nullable(),
    ingredientes: z.array(recetaIngredienteInputSchema).optional(),
  }),
]);

export const updateRecetaMenuSchema = z.object({
  recetaId: uuidSchema,
  categoriaMenu: categoriaMenuSchema.nullable(),
  descripcion: z.string().max(500).nullable(),
  imagenUrl: z
    .string()
    .url('URL inválida')
    .nullable()
    .or(z.literal('').transform(() => null)),
});

export const addIngredienteSchema = z.object({
  recetaId: uuidSchema,
  insumoId: uuidSchema,
  cantidad: cantidadSchema,
  unidad: unidadMedidaSchema.optional(),
  mermaCoeficiente: coeficienteMermaSchema.default(0),
});

export const createTandaSchema = z.object({
  recetaId: uuidSchema,
  turnoId: uuidSchema.optional(),
  cantidadTandas: z.number().int().positive('La cantidad de tandas debe ser mayor que 0'),
  zonaDestino: zonaServicioSchema,
  pedidoItemId: uuidSchema.optional(),
  notas: z.string().max(500).optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const transicionTandaSchema = z.object({
  tandaId: uuidSchema,
  estadoNuevo: estadoTandaSchema,
});

export const createMermaSchema = z.object({
  insumoId: uuidSchema,
  cantidad: cantidadSchema,
  categoria: categoriaMermaSchema,
  descripcion: z.string().max(500).optional(),
  idempotencyKey: idempotencyKeySchema,
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

export const despacharLoteBuffetSchema = z.object({
  recetaId: uuidSchema,
  cantidad: z.number().int().positive('La cantidad debe ser mayor que 0'),
  turnoId: uuidSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const registrarTicketsTurnoSchema = z.object({
  turnoId: uuidSchema,
  cantidadTickets: z.number().int().min(0, 'La cantidad de tickets no puede ser negativa'),
  idempotencyKey: idempotencyKeySchema,
});

export const enviarStuartSchema = z.object({
  descripcion: z.string().min(1, 'La descripción es obligatoria').max(500),
});

export const destinoPreparacionSchema = z.enum(['cocina_fria', 'cocina_caliente', 'pasteleria']);

export const solicitarPreparacionSchema = z.object({
  descripcion: z.string().min(1, 'La descripción es obligatoria').max(500),
  destino: destinoPreparacionSchema,
});

export const turnoBloqueSchema = z.enum(['6a2', '2a10', '10a6']);

export const createTurnoSchema = z.object({
  bloque: turnoBloqueSchema,
  teamlider: z.string().min(1, 'El nombre del jefe de turno es obligatorio').max(255),
});

// ── SuperUser: tenants y usuarios ────────────────────────────────────────────

export const crearTenantSchema = z.object({
  nombre: z.string().min(2, 'Nombre muy corto').max(100, 'Nombre muy largo'),
  slug: z
    .string()
    .min(3, 'Slug mínimo 3 caracteres')
    .max(32, 'Slug máximo 32 caracteres')
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
});

export const crearUsuarioSchema = z.object({
  tenantId: uuidSchema,
  nombre: z.string().min(2, 'Nombre muy corto').max(100, 'Nombre muy largo'),
  email: z.string().email('Email inválido'),
  role: userRoleSchema,
  password: z.string().min(8, 'Contraseña mínimo 8 caracteres').max(100, 'Contraseña muy larga'),
});

// ── Re-exports de tipos inferidos ─────────────────────────────────────────────

export type CreateInsumoInput = z.infer<typeof createInsumoSchema>;
export type CreateLoteInput = z.infer<typeof createLoteSchema>;
export type CreateRecetaInput = z.infer<typeof createRecetaSchema>;
export type RecetaIngredienteInput = z.infer<typeof recetaIngredienteInputSchema>;
export type UpdateRecetaMenuInput = z.infer<typeof updateRecetaMenuSchema>;
export type AddIngredienteInput = z.infer<typeof addIngredienteSchema>;
export type CreateTandaInput = z.infer<typeof createTandaSchema>;
export type TransicionTandaInput = z.infer<typeof transicionTandaSchema>;
export type CreateMermaInput = z.infer<typeof createMermaSchema>;
export type StockOutInput = z.infer<typeof stockOutSchema>;
export type CreatePedidoInput = z.infer<typeof createPedidoSchema>;
export type TransicionPedidoInput = z.infer<typeof transicionPedidoSchema>;
export type DespacharLoteBuffetInput = z.infer<typeof despacharLoteBuffetSchema>;
export type RegistrarTicketsTurnoInput = z.infer<typeof registrarTicketsTurnoSchema>;
export type EnviarStuartInput = z.infer<typeof enviarStuartSchema>;
export type SolicitarPreparacionInput = z.infer<typeof solicitarPreparacionSchema>;
export type CreateTurnoInput = z.infer<typeof createTurnoSchema>;
export type CrearTenantInput = z.infer<typeof crearTenantSchema>;
export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;

// ── Proveedores ───────────────────────────────────────────────────────────────

export const createProveedorSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio').max(255),
  contacto: z.string().max(255).optional().nullable(),
  telefono: z.string().max(30).optional().nullable(),
  email: z.string().email('Email inválido').optional().nullable(),
  notas: z.string().max(1000).optional().nullable(),
});

export const updateProveedorSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
  contacto: z.string().max(255).optional().nullable(),
  telefono: z.string().max(30).optional().nullable(),
  email: z.string().email('Email inválido').optional().nullable(),
  notas: z.string().max(1000).optional().nullable(),
  activo: z.boolean().optional(),
});

export type CreateProveedorInput = z.infer<typeof createProveedorSchema>;
export type UpdateProveedorInput = z.infer<typeof updateProveedorSchema>;

// ── Requisiciones (Frente 2) ──────────────────────────────────────────────────

export const areaSolicitanteSchema = z.enum([
  'cocina_caliente',
  'cocina_fria',
  'amex',
  'pasteleria',
]);

export const createRequisicionSchema = z.object({
  areaSolicitante: areaSolicitanteSchema,
  idempotencyKey: idempotencyKeySchema,
  notas: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        insumoId: uuidSchema,
        cantidadSolicitada: cantidadSchema,
        unidad: unidadMedidaSchema,
      }),
    )
    .min(1, 'Una requisición debe tener al menos un insumo'),
});

export const despacharRequisicionSchema = z.object({
  requisicionId: uuidSchema,
  version: z.number().int().positive(),
  items: z
    .array(
      z.object({
        itemId: uuidSchema,
        cantidadDespachada: cantidadSchema,
      }),
    )
    .min(1, 'Debe despachar al menos un insumo'),
});

export const transicionRequisicionSchema = z.object({
  requisicionId: uuidSchema,
  version: z.number().int().positive(),
});

export type CreateRequisicionInput = z.infer<typeof createRequisicionSchema>;
export type DespacharRequisicionInput = z.infer<typeof despacharRequisicionSchema>;
