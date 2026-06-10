/**
 * Carga el recetario oficial AMEX (scripts/data/recetario-amex.mjs) en Supabase.
 *
 * Idempotente: upsert por (tenant, nombre). Los ingredientes de cada receta se
 * reemplazan completos en cada corrida para que la DB quede EXACTAMENTE como
 * el archivo de datos (fuente de verdad versionada).
 *
 * No toca recetas que no estén en el archivo de datos (las 9 de la carta
 * anterior conviven, decisión del 2026-06-10).
 *
 * Uso:
 *   node --env-file=apps/web/.env.local scripts/seed-recetario-amex.mjs            # dry-run
 *   node --env-file=apps/web/.env.local scripts/seed-recetario-amex.mjs --apply    # escribe
 *   node --env-file=apps/web/.env.local scripts/seed-recetario-amex.mjs --apply --tenant otro-slug
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  TENANT_DEFAULT,
  INSUMOS_CAPA1,
  INSUMOS_CAPA2_PENDIENTES,
  RECLASIFICAR_A_CAPA2,
  PREPARACIONES,
  PLATOS,
} from './data/recetario-amex.mjs';
import { validarRecetario } from './lib/validar-recetario.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const requireFromWeb = createRequire(path.resolve(here, '..', 'apps', 'web', 'package.json'));
const { createClient } = requireFromWeb('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('✗ Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const tenantFlagIdx = args.indexOf('--tenant');
const TENANT_SLUG = tenantFlagIdx >= 0 ? args[tenantFlagIdx + 1] : TENANT_DEFAULT;

// ── 1. Validación de integridad del archivo de datos ─────────────────────────
const errores = validarRecetario({
  insumosCapa1: INSUMOS_CAPA1,
  insumosCapa2Pendientes: INSUMOS_CAPA2_PENDIENTES,
  preparaciones: PREPARACIONES,
  platos: PLATOS,
});
if (errores.length > 0) {
  console.error(`✗ El archivo de datos tiene ${errores.length} error(es) de integridad:`);
  for (const e of errores) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('✓ Integridad del archivo de datos OK');

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const norm = (s) => s.trim().toLowerCase();

async function main() {
  // ── 2. Tenant ───────────────────────────────────────────────────────────────
  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .select('id, nombre, slug')
    .eq('slug', TENANT_SLUG)
    .single();
  if (tErr || !tenant) {
    console.error(`✗ Tenant '${TENANT_SLUG}' no encontrado: ${tErr?.message ?? 'sin filas'}`);
    process.exit(1);
  }
  console.log(`✓ Tenant: ${tenant.nombre} (${tenant.id})${APPLY ? '' : '  [DRY-RUN]'}`);

  const stats = {
    insumosCreados: 0,
    insumosReclasificados: 0,
    recetasCreadas: 0,
    recetasActualizadas: 0,
    ingredientes: 0,
  };

  // ── 3. Insumos existentes ───────────────────────────────────────────────────
  const { data: existentes, error: iErr } = await admin
    .from('insumos')
    .select('id, nombre, capa, unidad_medida')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  if (iErr) throw new Error(`Leyendo insumos: ${iErr.message}`);
  const insumoPorNombre = new Map(existentes.map((i) => [norm(i.nombre), i]));

  // ── 4. Reclasificación capa_1 → capa_2 ─────────────────────────────────────
  for (const nombre of RECLASIFICAR_A_CAPA2) {
    const ins = insumoPorNombre.get(norm(nombre));
    if (!ins) {
      console.warn(
        `  ⚠ Reclasificar: insumo '${nombre}' no existe en el tenant — se creará como capa_2`,
      );
      continue;
    }
    if (ins.capa === 'capa_2') continue;
    if (APPLY) {
      const { error } = await admin
        .from('insumos')
        .update({ capa: 'capa_2', updated_at: new Date().toISOString() })
        .eq('id', ins.id)
        .eq('tenant_id', tenant.id);
      if (error) throw new Error(`Reclasificando '${nombre}': ${error.message}`);
    }
    ins.capa = 'capa_2';
    stats.insumosReclasificados++;
    console.log(`  ↺ ${nombre}: capa_1 → capa_2`);
  }

  // ── 5. Upsert de insumos ────────────────────────────────────────────────────
  async function ensureInsumo(nombre, unidad, capa) {
    const existente = insumoPorNombre.get(norm(nombre));
    if (existente) {
      if (existente.unidad_medida !== unidad) {
        console.warn(
          `  ⚠ '${nombre}' existe con unidad '${existente.unidad_medida}' (recetario: '${unidad}') — se respeta la existente`,
        );
      }
      return existente;
    }
    const nuevo = {
      tenant_id: tenant.id,
      nombre,
      capa,
      unidad_medida: unidad,
      stock_minimo: 0,
      merma_default: 0,
    };
    let row = { id: `dry-${norm(nombre)}`, nombre, capa, unidad_medida: unidad };
    if (APPLY) {
      const { data, error } = await admin
        .from('insumos')
        .insert(nuevo)
        .select('id, nombre, capa, unidad_medida')
        .single();
      if (error) throw new Error(`Creando insumo '${nombre}': ${error.message}`);
      row = data;
    }
    insumoPorNombre.set(norm(nombre), row);
    stats.insumosCreados++;
    console.log(`  + insumo ${capa}: ${nombre} (${unidad})`);
    return row;
  }

  for (const i of INSUMOS_CAPA1) await ensureInsumo(i.nombre, i.unidad, 'capa_1');
  for (const i of INSUMOS_CAPA2_PENDIENTES) await ensureInsumo(i.nombre, i.unidad, 'capa_2');
  for (const p of PREPARACIONES) await ensureInsumo(p.destino.nombre, p.destino.unidad, 'capa_2');

  // ── 6. Upsert de recetas ────────────────────────────────────────────────────
  const { data: recetasExistentes, error: rErr } = await admin
    .from('recetas')
    .select('id, nombre, tipo_receta')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  if (rErr) throw new Error(`Leyendo recetas: ${rErr.message}`);
  const recetaPorNombre = new Map(recetasExistentes.map((r) => [norm(r.nombre), r]));

  async function upsertReceta(payload, ingredientes) {
    const existente = recetaPorNombre.get(norm(payload.nombre));
    let recetaId = existente?.id ?? `dry-${norm(payload.nombre)}`;
    if (APPLY) {
      if (existente) {
        const { error } = await admin
          .from('recetas')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', existente.id)
          .eq('tenant_id', tenant.id);
        if (error) throw new Error(`Actualizando receta '${payload.nombre}': ${error.message}`);
        recetaId = existente.id;
      } else {
        const { data, error } = await admin
          .from('recetas')
          .insert({ tenant_id: tenant.id, ...payload })
          .select('id')
          .single();
        if (error) throw new Error(`Creando receta '${payload.nombre}': ${error.message}`);
        recetaId = data.id;
      }
      // Reemplazo completo de ingredientes — la DB queda exactamente como el archivo.
      const { error: delErr } = await admin
        .from('receta_ingredientes')
        .delete()
        .eq('receta_id', recetaId)
        .eq('tenant_id', tenant.id);
      if (delErr)
        throw new Error(`Limpiando ingredientes de '${payload.nombre}': ${delErr.message}`);
      const filas = ingredientes.map((ing) => ({
        tenant_id: tenant.id,
        receta_id: recetaId,
        insumo_id: insumoPorNombre.get(norm(ing.insumo)).id,
        cantidad: ing.cantidad,
        merma_coeficiente: 0,
      }));
      const { error: insErr } = await admin.from('receta_ingredientes').insert(filas);
      if (insErr)
        throw new Error(`Insertando ingredientes de '${payload.nombre}': ${insErr.message}`);
    }
    stats[existente ? 'recetasActualizadas' : 'recetasCreadas']++;
    stats.ingredientes += ingredientes.length;
    console.log(
      `  ${existente ? '↺' : '+'} receta ${payload.tipo_receta}: ${payload.nombre} (${ingredientes.length} ing)`,
    );
  }

  for (const p of PREPARACIONES) {
    const destino = insumoPorNombre.get(norm(p.destino.nombre));
    await upsertReceta(
      {
        nombre: p.nombre,
        tipo_receta: 'produccion',
        insumo_destino_id: APPLY ? destino.id : null,
        porciones: p.rendimiento ?? 1,
        area_produccion: p.area,
        activo: true,
      },
      p.ingredientes,
    );
  }

  for (const plato of PLATOS) {
    await upsertReceta(
      {
        nombre: plato.nombre,
        tipo_receta: 'servicio',
        zona: 'amex',
        porciones: plato.porciones,
        area_produccion: plato.area,
        categoria_menu: plato.categoria,
        descripcion: plato.descripcion,
        activo: true,
      },
      plato.ingredientes,
    );
  }

  // ── 7. Verificación post-carga ──────────────────────────────────────────────
  console.log('\n── Resumen ──');
  console.log(`  Insumos creados:        ${stats.insumosCreados}`);
  console.log(`  Insumos reclasificados: ${stats.insumosReclasificados}`);
  console.log(`  Recetas creadas:        ${stats.recetasCreadas}`);
  console.log(`  Recetas actualizadas:   ${stats.recetasActualizadas}`);
  console.log(`  Ingredientes escritos:  ${stats.ingredientes}`);

  if (APPLY) {
    const esperadas = [...PREPARACIONES.map((p) => p.nombre), ...PLATOS.map((p) => p.nombre)];
    const { data: verif } = await admin
      .from('recetas')
      .select('nombre, tipo_receta, receta_ingredientes(id)')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .in('nombre', esperadas);
    const porNombre = new Map((verif ?? []).map((r) => [norm(r.nombre), r]));
    let okCount = 0;
    const fallos = [];
    for (const p of PREPARACIONES) {
      const row = porNombre.get(norm(p.nombre));
      if (row && row.receta_ingredientes.length === p.ingredientes.length) okCount++;
      else
        fallos.push(
          `${p.nombre}: esperaba ${p.ingredientes.length} ing, DB tiene ${row?.receta_ingredientes.length ?? 'NADA'}`,
        );
    }
    for (const p of PLATOS) {
      const row = porNombre.get(norm(p.nombre));
      if (row && row.receta_ingredientes.length === p.ingredientes.length) okCount++;
      else
        fallos.push(
          `${p.nombre}: esperaba ${p.ingredientes.length} ing, DB tiene ${row?.receta_ingredientes.length ?? 'NADA'}`,
        );
    }
    console.log(
      `\n── Verificación DB vs archivo: ${okCount}/${esperadas.length} recetas exactas ──`,
    );
    if (fallos.length > 0) {
      for (const f of fallos) console.error(`  ✗ ${f}`);
      process.exit(1);
    }
    console.log('✓ La base de datos quedó exactamente como el recetario.');
  } else {
    console.log('\n[DRY-RUN] No se escribió nada. Ejecuta con --apply para aplicar.');
  }
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
