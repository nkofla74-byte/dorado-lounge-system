'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { verifyMesaToken } from '@/lib/qr/token';
import { rateLimit } from '@/lib/rate-limit';
import { verifyTurnstile } from '@/lib/turnstile/verify';
import { createPedidoSchema } from '@dorado/shared-validation';
import { ok, err, toAppError } from '@/lib/result';
import { headers } from 'next/headers';
import type { Result } from '@/lib/result';
import { rutearPedido } from '@/modules/orders/domain/routing';
import type { AreaProduccion, ZonaServicio } from '@dorado/shared-types';

export interface PublicIngrediente {
  nombre: string;
  unidadMedida: string;
}

export type CategoriaMenu = 'entrada' | 'plato_fuerte' | 'acompanante' | 'postre';

export interface PublicReceta {
  id: string;
  nombre: string;
  porciones: number;
  descripcion: string | null;
  categoriaMenu: CategoriaMenu | null;
  imagenUrl: string | null;
  ingredientes: PublicIngrediente[];
}

export interface MesaInfo {
  tenantId: string;
  zona: ZonaServicio;
  mesaNumero: string;
}

export interface PedidoQRInput {
  token: string;
  items: Array<{ recetaId: string; cantidad: number; notas?: string }>;
  notas?: string;
  idempotencyKey: string;
  turnstileToken?: string;
}

function getHeaderIp(h: Headers): string {
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip') ?? 'unknown';
}

export async function getMenuPublico(
  token: string,
): Promise<Result<{ recetas: PublicReceta[]; mesa: MesaInfo }>> {
  try {
    const mesa = await verifyMesaToken(token);
    if (!mesa) {
      return err(toAppError(new Error('QR inválido o expirado')));
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('recetas')
      .select(
        `
        id, nombre, porciones, descripcion, categoria_menu, imagen_url,
        receta_ingredientes(
          cantidad,
          insumos(nombre, unidad_medida)
        )
      `,
      )
      .eq('tenant_id', mesa.tenantId)
      .eq('tipo_receta', 'servicio')
      .eq('activo', true) // F-018: respetar el toggle de disponibilidad del chef
      .not('categoria_menu', 'is', null)
      .is('deleted_at', null)
      .order('nombre');

    if (error) return err(toAppError(new Error(error.message)));

    const recetas: PublicReceta[] = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r['id'] as string,
      nombre: r['nombre'] as string,
      porciones: r['porciones'] as number,
      descripcion: (r['descripcion'] as string | null) ?? null,
      categoriaMenu: (r['categoria_menu'] as CategoriaMenu | null) ?? null,
      imagenUrl: (r['imagen_url'] as string | null) ?? null,
      ingredientes: ((r['receta_ingredientes'] as Array<Record<string, unknown>>) ?? []).map(
        (ri) => {
          const insumo = ri['insumos'] as Record<string, unknown> | null;
          return {
            nombre: (insumo?.['nombre'] as string) ?? '',
            unidadMedida: (insumo?.['unidad_medida'] as string) ?? '',
          };
        },
      ),
    }));

    return ok({
      recetas,
      mesa: {
        tenantId: mesa.tenantId,
        zona: mesa.zona,
        mesaNumero: mesa.mesaNumero,
      },
    });
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function createPedidoFromQR(
  input: PedidoQRInput,
): Promise<Result<{ pedidoId: string }>> {
  try {
    const mesa = await verifyMesaToken(input.token);
    if (!mesa) {
      return err(toAppError(new Error('QR inválido o expirado')));
    }

    const h = await headers();
    const ip = getHeaderIp(h);
    const rl = await rateLimit('qrOrder', `${mesa.tenantId}:${mesa.mesaNumero}:${ip}`);
    if (!rl.allowed) {
      return err(
        toAppError(new Error('Demasiados pedidos desde esta mesa. Intenta en unos minutos.')),
      );
    }

    // Turnstile: cuando el secret está configurado, exigir token válido en cada pedido.
    // Bloquea bots que reutilicen un JWT de mesa válido para spam de pedidos.
    if (process.env['TURNSTILE_SECRET_KEY']) {
      if (!input.turnstileToken) {
        return err(toAppError(new Error('Verificación anti-bot requerida')));
      }
      const turnstile = await verifyTurnstile(input.turnstileToken);
      if (!turnstile.ok) {
        return err(toAppError(new Error('Verificación anti-bot inválida')));
      }
    }

    const parsed = createPedidoSchema.safeParse({
      zona: mesa.zona,
      numeroMesa: mesa.mesaNumero,
      notas: input.notas,
      idempotencyKey: input.idempotencyKey,
      items: input.items,
    });
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const admin = createAdminClient();

    // SEGURIDAD: validar que TODOS los recetaIds pertenecen al tenant de la mesa
    // y son recetas de menú QR (servicio + categoria_menu NOT NULL).
    // Previene cross-tenant injection con tokens válidos.
    const recetaIds = Array.from(new Set(parsed.data.items.map((i) => i.recetaId)));
    const { data: recetasValidas, error: recetasError } = await admin
      .from('recetas')
      .select('id, area_produccion')
      .eq('tenant_id', mesa.tenantId)
      .eq('tipo_receta', 'servicio')
      .eq('activo', true) // F-018
      .not('categoria_menu', 'is', null)
      .is('deleted_at', null)
      .in('id', recetaIds);

    if (recetasError) return err(toAppError(new Error(recetasError.message)));
    if (!recetasValidas || recetasValidas.length !== recetaIds.length) {
      return err(
        toAppError(new Error('Uno o más platos del pedido no son válidos para esta mesa')),
      );
    }

    // Ruteo por área: la misma función de dominio que usa el alta interna. Sin
    // esto los ítems quedaban con área NULL, invisibles para los cuatro KDS, y
    // el pedido no podía avanzar más allá de 'creado' (F-007).
    const areasPorReceta = Object.fromEntries(
      (recetasValidas as Array<{ id: string; area_produccion: AreaProduccion | null }>).map((r) => [
        r.id,
        r.area_produccion,
      ]),
    );
    const ruteo = rutearPedido(
      mesa.zona,
      parsed.data.items.map((i) => ({
        recetaId: i.recetaId,
        areaProduccion: areasPorReceta[i.recetaId] ?? null,
      })),
    );
    if (ruteo.itemsSinArea.length > 0) {
      return err(
        toAppError(new Error('Hay platos sin área de cocina asignada. Avisa a un mesero.')),
      );
    }
    if (ruteo.areasNoPermitidas.length > 0) {
      return err(toAppError(new Error('Alguno de los platos no se sirve en esta zona.')));
    }

    // Alta atómica (pedido + ítems en una transacción). Antes eran dos INSERT
    // independientes: si fallaba el segundo quedaba un pedido huérfano sin
    // ítems, el defecto que fn_crear_pedido ya había resuelto para el alta
    // interna y que el camino QR nunca adoptó (F-007).
    // Sin assertCan: la credencial es el token de mesa, ya verificado arriba.
    const { data: nuevoPedidoId, error: pedidoError } = await admin.rpc('fn_crear_pedido_qr', {
      p_tenant_id: mesa.tenantId,
      p_zona: parsed.data.zona,
      p_numero_mesa: parsed.data.numeroMesa ?? null,
      p_notas: parsed.data.notas ?? null,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_items: parsed.data.items.map((item) => ({
        receta_id: item.recetaId,
        cantidad: item.cantidad,
        notas: item.notas ?? null,
        area_produccion: areasPorReceta[item.recetaId],
      })),
    });

    if (pedidoError) {
      // Idempotencia: el reintento de un pedido ya registrado devuelve el mismo.
      if (pedidoError.code === '23505') {
        const { data: existente } = await admin
          .from('pedidos')
          .select('id')
          .eq('idempotency_key', parsed.data.idempotencyKey)
          .eq('tenant_id', mesa.tenantId)
          .single();
        if (existente) return ok({ pedidoId: existente.id });
      }
      return err(toAppError(new Error(pedidoError.message)));
    }

    const pedido = { id: nuevoPedidoId as string };

    // Emitir evento a cocina
    try {
      const { emitEvent } = await import('@/lib/socket/emit-event');
      const { CHANNELS } = await import('@dorado/shared-types');
      await emitEvent(mesa.tenantId, CHANNELS.COCINA, {
        type: 'PEDIDO_CREADO',
        payload: {
          pedidoId: pedido.id,
          tenantId: mesa.tenantId,
          zona: mesa.zona,
          numeroMesa: mesa.mesaNumero,
          items: parsed.data.items.map((i) => ({
            recetaId: i.recetaId,
            cantidad: i.cantidad,
            nombre: '',
          })),
          creadoPor: 'qr_pasajero',
          createdAt: new Date().toISOString(),
        },
      });
    } catch {
      // Broadcast no crítico — el pedido ya está guardado
    }

    return ok({ pedidoId: pedido.id });
  } catch (e) {
    return err(toAppError(e));
  }
}
