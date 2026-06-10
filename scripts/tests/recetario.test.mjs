/**
 * Tests de integridad del recetario oficial AMEX.
 * Ejecutar: node --test scripts/tests/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INSUMOS_CAPA1,
  INSUMOS_CAPA2_PENDIENTES,
  PREPARACIONES,
  PLATOS,
} from '../data/recetario-amex.mjs';
import { validarRecetario } from '../lib/validar-recetario.mjs';

test('el recetario no tiene errores de integridad', () => {
  const errores = validarRecetario({
    insumosCapa1: INSUMOS_CAPA1,
    insumosCapa2Pendientes: INSUMOS_CAPA2_PENDIENTES,
    preparaciones: PREPARACIONES,
    platos: PLATOS,
  });
  assert.deepEqual(errores, []);
});

test('la validación detecta referencias rotas', () => {
  const errores = validarRecetario({
    insumosCapa1: [{ nombre: 'X', unidad: 'g' }],
    insumosCapa2Pendientes: [],
    preparaciones: [],
    platos: [
      {
        nombre: 'Plato roto',
        categoria: 'entrada',
        area: 'amex',
        porciones: 1,
        descripcion: 'x',
        ingredientes: [{ insumo: 'No existe', cantidad: 10 }],
      },
    ],
  });
  assert.equal(errores.length, 1);
  assert.match(errores[0], /no declarado/);
});

test('la validación detecta cantidades inválidas y categorías desconocidas', () => {
  const errores = validarRecetario({
    insumosCapa1: [{ nombre: 'X', unidad: 'g' }],
    insumosCapa2Pendientes: [],
    preparaciones: [],
    platos: [
      {
        nombre: 'Plato roto',
        categoria: 'cena',
        area: 'amex',
        porciones: 1,
        descripcion: 'x',
        ingredientes: [{ insumo: 'X', cantidad: 0 }],
      },
    ],
  });
  assert.equal(errores.length, 2);
});

test('los 17 platos del recetario tienen categoría y descripción de carta', () => {
  assert.equal(PLATOS.length, 17);
  for (const p of PLATOS) {
    assert.ok(p.categoria, `${p.nombre} sin categoría`);
    assert.ok(p.descripcion, `${p.nombre} sin descripción`);
  }
});

test('los postres rutean a pastelería y lo salado al KDS amex', () => {
  for (const p of PLATOS) {
    if (p.categoria === 'postre') assert.equal(p.area, 'pasteleria', p.nombre);
    else assert.equal(p.area, 'amex', p.nombre);
  }
});

test('toda preparación produce un insumo capa_2 distinto', () => {
  const destinos = PREPARACIONES.map((p) => p.destino.nombre.toLowerCase());
  assert.equal(new Set(destinos).size, destinos.length);
});
