'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { verifyMesaToken } from '@/lib/qr/token';
import { rateLimit } from '@/lib/rate-limit';
import { createPedidoSchema } from '@dorado/shared-validation';
import { ok, err, toAppError } from '@/lib/result';
import { headers } from 'next/headers';
import type { Result } from '@/lib/result';
import type { ZonaServicio } from '@dorado/shared-types';

export interface PublicIngrediente {
  nombre: string;
  unidadMedida: string;
}

export type CategoriaMenu = 'entrada' | 'plato_fuerte' | 'acompanante';

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
      .select('id')
      .eq('tenant_id', mesa.tenantId)
      .eq('tipo_receta', 'servicio')
      .not('categoria_menu', 'is', null)
      .is('deleted_at', null)
      .in('id', recetaIds);

    if (recetasError) return err(toAppError(new Error(recetasError.message)));
    if (!recetasValidas || recetasValidas.length !== recetaIds.length) {
      return err(
        toAppError(new Error('Uno o más platos del pedido no son válidos para esta mesa')),
      );
    }

    // Insertar pedido directamente (sin assertCan — token ya autenticó la mesa)
    const { data: pedido, error: pedidoError } = await admin
      .from('pedidos')
      .insert({
        tenant_id: mesa.tenantId,
        zona: parsed.data.zona,
        numero_mesa: parsed.data.numeroMesa ?? null,
        notas: parsed.data.notas ?? null,
        estado: 'creado',
        version: 1,
        origen: 'qr_pasajero',
        idempotency_key: parsed.data.idempotencyKey,
      })
      .select('id')
      .single();

    if (pedidoError) {
      // Idempotencia: si ya existe, devolver el pedido existente
      if (pedidoError.code === '23505') {
        const { data: existing } = await admin
          .from('pedidos')
          .select('id')
          .eq('idempotency_key', parsed.data.idempotencyKey)
          .eq('tenant_id', mesa.tenantId)
          .single();
        if (existing) return ok({ pedidoId: existing.id });
      }
      return err(toAppError(new Error(pedidoError.message)));
    }

    // Insertar ítems
    const itemsToInsert = parsed.data.items.map((item) => ({
      pedido_id: pedido.id,
      tenant_id: mesa.tenantId,
      receta_id: item.recetaId,
      cantidad: item.cantidad,
      notas: item.notas ?? null,
    }));

    const { error: itemsError } = await admin.from('pedido_items').insert(itemsToInsert);
    if (itemsError) return err(toAppError(new Error(itemsError.message)));

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
