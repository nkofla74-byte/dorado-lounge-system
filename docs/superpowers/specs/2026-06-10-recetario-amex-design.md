# Recetario oficial AMEX — diseño de carga y validación estructural

**Fecha:** 2026-06-10 · **Aprobado por:** usuario (sesión remote control)
**Fuente:** "RECETARIO COMPLETO - ESTANDARIZACIÓN DE COCINA" (pegado en chat, transcrito a `scripts/data/recetario-amex.mjs`)

## Decisiones del usuario

1. Las 9 recetas AMEX existentes **conviven** con las nuevas (no se desactivan).
2. Ingredientes "c/n" → **se estandarizan cantidades conservadoras** (`estimado: true`), pendientes de validación del chef. Control total: todo descuenta stock.
3. Preparaciones referenciadas pero no definidas (ají de uchuva, arroz con coco, ropa vieja, fondos, cebolla encurtida, demi-glace) → se crean como **insumos capa_2 sin receta de producción** y quedan en la lista de pendientes del chef.
4. Mecanismo: **seed script idempotente** + archivo de datos versionado. Solo el enum va como migración.

## Estructura

- Migración: `ALTER TYPE categoria_menu ADD VALUE IF NOT EXISTS 'postre'`.
- Reclasificación a `capa_2` (en el seed, tenant-scoped, no en migración): **Hogao**, **Refrito del pacífico**, **Leche de coco** — el recetario los define como preparaciones con receta propia.

## Modelado

- ~24 preparaciones base → `recetas` tipo `produccion` con `insumo_destino_id` capa_2. Cantidades por tanda tal cual el documento (el sistema multiplica por `cantidad_tandas`). `porciones` = rendimiento en unidad base del insumo destino (400 ml → 400); sin rendimiento documentado → 1.
- ~14 platos → `recetas` tipo `servicio`, `zona='amex'`, 1 pax (asado de tira: 4). Referencian insumos capa_2 de las bases.
- `area_produccion`: platos salados → `amex`; postres → `pasteleria`. Bases: área que las produce (calientes → `cocina_caliente`, frías → `cocina_fria`, dulces/masas dulces → `pasteleria`).
- Unidades: doc usa gr/ml/und/lt/kg → se normaliza a g/ml/unidad (`unidad_display` conserva la original cuando difiere). `merma_coeficiente` = 0 (modelo F3: merma en recepción). `merma_default` de insumos nuevos = 0, calibración pendiente.
- **Agua no es insumo de stock** (se excluye de ingredientes; documentado como supuesto).

## Carta (categoria_menu)

- **entrada:** Ceviche caribeño · Sopa de arracacha · Sopa de verduras con arepas · Tostada de pepitas
- **plato_fuerte:** Tamal nativo · Calentao de ropa vieja · Pesca del día en salsa de corozo · Asado de tira nativo
- **acompanante:** Tartaleta de duxelle · Empanada de pollo encocado · Empanada de posta · Arepa con posta y hogao · Papa criolla rellena · Muffin de huevos pericos
- **postre:** Flan de caramelo · Cocadas de cacao garrapiñado · Enyucado costeño
- Bases de producción: sin `categoria_menu` (no aparecen en QR).

## Entregables

1. `supabase/migrations/<ts>_categoria_menu_postre.sql`
2. `scripts/data/recetario-amex.mjs` — datos completos, con flags `estimado` y notas de supuesto.
3. `scripts/seed-recetario-amex.mjs` — idempotente (upsert por tenant+nombre), `--tenant <slug>` (default dorado-lounge), `--dry-run`, validación de integridad pre-escritura y verificación post-carga.
4. `docs/recetario/pendientes-chef.md` — estimados c/n, recetas faltantes, ambigüedades y supuestos.
5. Test de integridad de datos ejecutable con `node --test scripts/tests/`.

## Verificación

- Dry-run primero; luego carga real contra el tenant dorado-lounge.
- Query de verificación: conteo y diff de recetas/ingredientes DB vs. archivo de datos.
