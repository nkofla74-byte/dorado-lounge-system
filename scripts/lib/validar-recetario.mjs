/**
 * Validación de integridad del recetario (scripts/data/recetario-amex.mjs).
 * Usada por el seed antes de escribir y por los tests (scripts/tests/).
 */

const UNIDADES_VALIDAS = new Set(['g', 'ml', 'unidad']);
const CATEGORIAS_VALIDAS = new Set(['entrada', 'plato_fuerte', 'acompanante', 'postre']);
const AREAS_VALIDAS = new Set(['cocina_caliente', 'cocina_fria', 'pasteleria', 'amex']);

// Insumos capa_1 que ya existen en la DB y el recetario reutiliza por nombre.
export const INSUMOS_PREEXISTENTES = [
  'Aceite de coco',
  'Aguacate',
  'Ají dulce',
  'Ajo',
  'Arroz',
  'Cebolla roja',
  'Cilantro',
  'Contramuslo de pollo',
  'Espinaca',
  'Hogao',
  'Leche de coco',
  'Maíz dulce',
  'Mantequilla',
  'Panela molida',
  'Papa criolla',
  'Pulpa de corozo',
  'Queso parmesano',
  'Refrito del pacífico',
  'Sal',
  'Tomillo',
  'Vino blanco',
  'Vino tinto',
  'Zanahoria',
  'Zumo de limón',
];

const norm = (s) => s.trim().toLowerCase();

export function validarRecetario({ insumosCapa1, insumosCapa2Pendientes, preparaciones, platos }) {
  const errores = [];

  // Universo de insumos referenciables
  const universo = new Set(INSUMOS_PREEXISTENTES.map(norm));
  for (const i of insumosCapa1) universo.add(norm(i.nombre));
  for (const i of insumosCapa2Pendientes) universo.add(norm(i.nombre));
  for (const p of preparaciones) universo.add(norm(p.destino.nombre));

  // Unicidad de nombres de insumos declarados
  const declarados = [...insumosCapa1, ...insumosCapa2Pendientes].map((i) => norm(i.nombre));
  const vistos = new Set();
  for (const n of declarados) {
    if (vistos.has(n)) errores.push(`Insumo duplicado en la declaración: '${n}'`);
    vistos.add(n);
  }

  // Unidades de insumos
  for (const i of [...insumosCapa1, ...insumosCapa2Pendientes]) {
    if (!UNIDADES_VALIDAS.has(i.unidad)) {
      errores.push(`Insumo '${i.nombre}': unidad inválida '${i.unidad}'`);
    }
  }

  const nombresReceta = new Set();
  const checkReceta = (r, tipo) => {
    if (nombresReceta.has(norm(r.nombre))) errores.push(`Receta duplicada: '${r.nombre}'`);
    nombresReceta.add(norm(r.nombre));
    if (!r.ingredientes || r.ingredientes.length === 0) {
      errores.push(`${tipo} '${r.nombre}': sin ingredientes`);
      return;
    }
    const insumosDeReceta = new Set();
    for (const ing of r.ingredientes) {
      if (!universo.has(norm(ing.insumo))) {
        errores.push(
          `${tipo} '${r.nombre}': ingrediente '${ing.insumo}' no declarado en ningún catálogo`,
        );
      }
      if (insumosDeReceta.has(norm(ing.insumo))) {
        errores.push(
          `${tipo} '${r.nombre}': ingrediente repetido '${ing.insumo}' (constraint UNIQUE receta+insumo)`,
        );
      }
      insumosDeReceta.add(norm(ing.insumo));
      if (!(typeof ing.cantidad === 'number') || !(ing.cantidad > 0)) {
        errores.push(
          `${tipo} '${r.nombre}': cantidad inválida para '${ing.insumo}' (${ing.cantidad})`,
        );
      }
    }
  };

  for (const p of preparaciones) {
    checkReceta(p, 'Preparación');
    if (!UNIDADES_VALIDAS.has(p.destino.unidad)) {
      errores.push(`Preparación '${p.nombre}': unidad de destino inválida '${p.destino.unidad}'`);
    }
    if (p.rendimiento !== null && (!Number.isInteger(p.rendimiento) || p.rendimiento <= 0)) {
      errores.push(
        `Preparación '${p.nombre}': rendimiento inválido (${p.rendimiento}) — entero > 0 o null`,
      );
    }
    if (!AREAS_VALIDAS.has(p.area)) {
      errores.push(`Preparación '${p.nombre}': área inválida '${p.area}'`);
    }
    // Una preparación no puede usarse a sí misma
    if (p.ingredientes.some((i) => norm(i.insumo) === norm(p.destino.nombre))) {
      errores.push(`Preparación '${p.nombre}': se referencia a sí misma`);
    }
  }

  for (const plato of platos) {
    checkReceta(plato, 'Plato');
    if (!CATEGORIAS_VALIDAS.has(plato.categoria)) {
      errores.push(`Plato '${plato.nombre}': categoría inválida '${plato.categoria}'`);
    }
    if (!AREAS_VALIDAS.has(plato.area)) {
      errores.push(`Plato '${plato.nombre}': área inválida '${plato.area}'`);
    }
    if (!Number.isInteger(plato.porciones) || plato.porciones <= 0) {
      errores.push(`Plato '${plato.nombre}': porciones inválidas (${plato.porciones})`);
    }
    if (!plato.descripcion) {
      errores.push(`Plato '${plato.nombre}': falta descripción (visible en menú QR)`);
    }
  }

  return errores;
}
