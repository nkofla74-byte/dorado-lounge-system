import { describe, it, expect } from 'vitest';
import {
  uuidSchema,
  idempotencyKeySchema,
  cantidadSchema,
  coeficienteMermaSchema,
  precioCopSchema,
  createInsumoSchema,
  createLoteSchema,
  createPedidoSchema,
  createTurnoSchema,
  createRecetaSchema,
  crearTenantSchema,
  crearUsuarioSchema,
  createProveedorSchema,
} from '../index';

describe('uuidSchema', () => {
  it('acepta UUID v4 válido', () => {
    expect(uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
  });

  it('rechaza string vacío', () => {
    expect(uuidSchema.safeParse('').success).toBe(false);
  });

  it('rechaza formato inválido', () => {
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('idempotencyKeySchema', () => {
  it('acepta key alfanumérica con guiones y puntos', () => {
    expect(idempotencyKeySchema.safeParse('ord-123-abc').success).toBe(true);
    expect(idempotencyKeySchema.safeParse('pedido:123:item:456').success).toBe(true);
  });

  it('rechaza string vacío', () => {
    expect(idempotencyKeySchema.safeParse('').success).toBe(false);
  });

  it('rechaza caracteres especiales', () => {
    expect(idempotencyKeySchema.safeParse('key with spaces').success).toBe(false);
    expect(idempotencyKeySchema.safeParse('key@#$').success).toBe(false);
  });
});

describe('cantidadSchema', () => {
  it('acepta valores positivos hasta 4 decimales', () => {
    expect(cantidadSchema.safeParse(1).success).toBe(true);
    expect(cantidadSchema.safeParse(0.5).success).toBe(true);
    expect(cantidadSchema.safeParse(100.1234).success).toBe(true);
  });

  it('rechaza cero y negativos', () => {
    expect(cantidadSchema.safeParse(0).success).toBe(false);
    expect(cantidadSchema.safeParse(-1).success).toBe(false);
  });

  it('rechaza más de 4 decimales', () => {
    expect(cantidadSchema.safeParse(1.00001).success).toBe(false);
  });
});

describe('coeficienteMermaSchema', () => {
  it('acepta 0 (sin merma)', () => {
    expect(coeficienteMermaSchema.safeParse(0).success).toBe(true);
  });

  it('acepta valores < 1', () => {
    expect(coeficienteMermaSchema.safeParse(0.1).success).toBe(true);
    expect(coeficienteMermaSchema.safeParse(0.9999).success).toBe(true);
  });

  it('rechaza 1 y mayores', () => {
    expect(coeficienteMermaSchema.safeParse(1).success).toBe(false);
    expect(coeficienteMermaSchema.safeParse(1.5).success).toBe(false);
  });

  it('rechaza negativos', () => {
    expect(coeficienteMermaSchema.safeParse(-0.1).success).toBe(false);
  });
});

describe('precioCopSchema', () => {
  it('acepta precios COP válidos', () => {
    expect(precioCopSchema.safeParse(1500).success).toBe(true);
    expect(precioCopSchema.safeParse(99.99).success).toBe(true);
  });

  it('rechaza más de 2 decimales', () => {
    expect(precioCopSchema.safeParse(10.999).success).toBe(false);
  });

  it('rechaza cero y negativos', () => {
    expect(precioCopSchema.safeParse(0).success).toBe(false);
    expect(precioCopSchema.safeParse(-100).success).toBe(false);
  });
});

describe('createPedidoSchema', () => {
  const validPedido = {
    zona: 'amex',
    idempotencyKey: 'ord-123',
    items: [{ recetaId: '550e8400-e29b-41d4-a716-446655440000', cantidad: 2 }],
  };

  it('acepta pedido válido', () => {
    expect(createPedidoSchema.safeParse(validPedido).success).toBe(true);
  });

  it('acepta con mesa y notas opcionales', () => {
    const result = createPedidoSchema.safeParse({
      ...validPedido,
      numeroMesa: 'A3',
      notas: 'Sin cebolla',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza sin items', () => {
    expect(createPedidoSchema.safeParse({ ...validPedido, items: [] }).success).toBe(false);
  });

  it('rechaza zona inválida', () => {
    expect(createPedidoSchema.safeParse({ ...validPedido, zona: 'cocina' }).success).toBe(false);
  });

  it('rechaza cantidad no positiva en items', () => {
    const bad = {
      ...validPedido,
      items: [{ recetaId: '550e8400-e29b-41d4-a716-446655440000', cantidad: 0 }],
    };
    expect(createPedidoSchema.safeParse(bad).success).toBe(false);
  });
});

describe('createInsumoSchema', () => {
  it('acepta insumo válido con defaults', () => {
    const result = createInsumoSchema.safeParse({
      nombre: 'Pollo',
      capa: 'capa_1',
      unidadMedida: 'g',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stockMinimo).toBe(0);
      expect(result.data.mermaDefault).toBe(0);
    }
  });

  it('rechaza nombre vacío', () => {
    expect(
      createInsumoSchema.safeParse({ nombre: '', capa: 'capa_1', unidadMedida: 'g' }).success,
    ).toBe(false);
  });
});

describe('createLoteSchema', () => {
  it('acepta lote sin empaques', () => {
    const result = createLoteSchema.safeParse({
      insumoId: '550e8400-e29b-41d4-a716-446655440000',
      cantidadInicial: 10,
    });
    expect(result.success).toBe(true);
  });

  it('acepta lote con empaques completos', () => {
    const result = createLoteSchema.safeParse({
      insumoId: '550e8400-e29b-41d4-a716-446655440000',
      cantidadInicial: 10,
      cantidadEmpaques: 5,
      pesoUnitario: 2,
      unidadPeso: 'g',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza empaques parciales (todos o ninguno)', () => {
    const result = createLoteSchema.safeParse({
      insumoId: '550e8400-e29b-41d4-a716-446655440000',
      cantidadInicial: 10,
      cantidadEmpaques: 5,
    });
    expect(result.success).toBe(false);
  });
});

describe('createTurnoSchema', () => {
  it('acepta turno válido', () => {
    const result = createTurnoSchema.safeParse({ bloque: '6a2', teamlider: 'Juan' });
    expect(result.success).toBe(true);
  });

  it('rechaza bloque inválido', () => {
    expect(createTurnoSchema.safeParse({ bloque: 'noche', teamlider: 'Juan' }).success).toBe(false);
  });

  it('rechaza teamlider vacío', () => {
    expect(createTurnoSchema.safeParse({ bloque: '6a2', teamlider: '' }).success).toBe(false);
  });
});

describe('crearTenantSchema', () => {
  it('acepta tenant válido', () => {
    expect(crearTenantSchema.safeParse({ nombre: 'Dorado', slug: 'dorado-lounge' }).success).toBe(
      true,
    );
  });

  it('rechaza slug con mayúsculas o espacios', () => {
    expect(crearTenantSchema.safeParse({ nombre: 'Test', slug: 'Bad Slug' }).success).toBe(false);
    expect(crearTenantSchema.safeParse({ nombre: 'Test', slug: 'BadSlug' }).success).toBe(false);
  });
});

describe('crearUsuarioSchema', () => {
  it('acepta usuario válido', () => {
    const result = crearUsuarioSchema.safeParse({
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      nombre: 'María',
      email: 'maria@test.com',
      role: 'chef_cocina_fria',
      password: 'segura123',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza password corta', () => {
    const result = crearUsuarioSchema.safeParse({
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      nombre: 'Test',
      email: 'test@test.com',
      role: 'admin',
      password: '123',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza rol inexistente', () => {
    const result = crearUsuarioSchema.safeParse({
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      nombre: 'Test',
      email: 'test@test.com',
      role: 'gerente',
      password: 'segura123',
    });
    expect(result.success).toBe(false);
  });
});

describe('createProveedorSchema', () => {
  it('acepta con solo nombre', () => {
    expect(createProveedorSchema.safeParse({ nombre: 'Proveedor X' }).success).toBe(true);
  });

  it('rechaza email inválido', () => {
    expect(createProveedorSchema.safeParse({ nombre: 'X', email: 'not-email' }).success).toBe(
      false,
    );
  });
});

describe('createRecetaSchema', () => {
  it('acepta receta de producción', () => {
    const result = createRecetaSchema.safeParse({
      tipoReceta: 'produccion',
      nombre: 'Pan de bono',
      insumoDestinoId: '550e8400-e29b-41d4-a716-446655440000',
      porciones: 12,
      rendimientoCantidad: 40,
    });
    expect(result.success).toBe(true);
  });

  // Regresión de F-037: una receta de producción sin rendimiento hacía que
  // completar la tanda descontara los ingredientes sin crear el producto
  // elaborado. La base lo rechaza con un CHECK; el schema lo rechaza antes.
  it('rechaza una receta de producción sin rendimiento por tanda', () => {
    const result = createRecetaSchema.safeParse({
      tipoReceta: 'produccion',
      nombre: 'Pan de bono',
      insumoDestinoId: '550e8400-e29b-41d4-a716-446655440000',
      porciones: 12,
    });
    expect(result.success).toBe(false);
  });

  it('rechaza un rendimiento de cero o negativo', () => {
    for (const rendimientoCantidad of [0, -5]) {
      const result = createRecetaSchema.safeParse({
        tipoReceta: 'produccion',
        nombre: 'Pan de bono',
        insumoDestinoId: '550e8400-e29b-41d4-a716-446655440000',
        porciones: 12,
        rendimientoCantidad,
      });
      expect(result.success).toBe(false);
    }
  });

  it('acepta receta de servicio', () => {
    const result = createRecetaSchema.safeParse({
      tipoReceta: 'servicio',
      nombre: 'Filete Dorado',
      zona: 'amex',
      porciones: 1,
      categoriaMenu: 'plato_fuerte',
    });
    expect(result.success).toBe(true);
  });

  it('receta de servicio requiere zona', () => {
    const result = createRecetaSchema.safeParse({
      tipoReceta: 'servicio',
      nombre: 'Filete',
      porciones: 1,
    });
    expect(result.success).toBe(false);
  });

  it('receta de producción requiere insumoDestinoId', () => {
    const result = createRecetaSchema.safeParse({
      tipoReceta: 'produccion',
      nombre: 'Pan',
      porciones: 12,
    });
    expect(result.success).toBe(false);
  });
});
