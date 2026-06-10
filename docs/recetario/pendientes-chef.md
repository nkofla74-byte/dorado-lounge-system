# Recetario AMEX — pendientes de validación del chef

Generado en la carga del recetario oficial (2026-06-10). El sistema quedó con
el recetario tal cual el documento, salvo los puntos de esta lista, que
requieren decisión o dato de cocina. Fuente de verdad de los datos:
`scripts/data/recetario-amex.mjs` (todo lo estimado está marcado `estimado: true`).

## 1. Recetas faltantes (referenciadas pero no definidas en el documento)

Estos insumos existen en el sistema como producto interno (capa 2) pero **no
tienen receta de producción** — no se pueden producir ni costear hasta que
cocina entregue su estandarización:

| Insumo pendiente              | Lo usan                                                  |
| ----------------------------- | -------------------------------------------------------- |
| Ají de uchuva                 | Empanada de posta, hogao y ají de uchuva                 |
| Arroz con coco                | Calentao de ropa vieja                                   |
| Ropa vieja                    | Calentao de ropa vieja · Papa criolla rellena            |
| Puré de papa criolla          | Relleno de pollo encocado · Guiso de pollo               |
| Fondo de pollo                | Masa de tamal · Guiso de pollo                           |
| Fondo de cocción de morrillo  | Masa de tamal                                            |
| Fondo de verduras concentrado | Puré de pepitas de calabaza                              |
| Demi-glace de posta           | Salsa de hongos · Posta desmechada en reducción oriental |
| Cebolla roja encurtida        | Aderezo de pepino y suero                                |

## 2. Cantidades estandarizadas (el documento decía "c/n" o era ambiguo)

Valores conservadores cargados para no perder control de inventario; el chef
debe confirmarlos o corregirlos:

- **Sal/pimienta c/n:** sal 1–3 g según preparación; pimienta 0.3–0.5 g.
- **Aceite de fritura (chips de plátano):** 100 ml por tanda (absorción).
- **Huevo para pintar empanadas:** 0.05 und por empanada.
- **Mezcla de hongos (duxelle):** split 50/50 París/Portobello (300 g).
- **Hierbas aromatizantes (base de tomate):** laurel 2.5 g + tomillo 2.5 g.
- **Cocadas:** queso campesino 75 g/tanda, ajonjolí 50 g, nibs 100 g y azúcar
  100 g (los dos últimos aparecen en el procedimiento pero no en la lista de
  ingredientes del documento). Rendimiento estimado: 50 und.
- **Muffin de huevos pericos:** 515 g de huevo ≈ 10.3 und; rendimiento ≈ 17 muffins.
- **Porciones de servicio estimadas:** sopa de verduras 250 ml/pax + arepitas
  50 g; cocadas 2 und/pax; enyucado 120 g/pax; papa criolla rostizada 60 g/und.

## 3. Inconsistencias del documento a revisar

- **Sopa de arracacha:** dice "Rendimiento: 1 pax" pero las cantidades parecen
  de lote (300 g de arracacha, 300 g de arveja por porción). Se cargó tal cual —
  revisar antes de costear.
- **Cocción de posta:** el líquido colado es la futura demi-glace, pero no hay
  receta de la reducción. Ver punto 1.
- **Rendimientos sin dato:** refrito del Pacífico, masa de empanada, masa de
  tamal, guiso de pollo, leche de coco, mantequilla de setas, aderezo, encurtido,
  mermelada, jamón de bondiola, requesón, nutella, crema montada, enyucado,
  masa de arroz/arepa dulce. Quedaron con porciones = 1; al definir rendimiento
  real, actualizar receta.
- **"Receta Estándar 4.x"** (enyucado, nutella, crema montada): nomenclatura
  del documento sin equivalencia en el sistema; se ignoró.

## 4. Supuestos de mapeo de insumos

- Agua **no** es insumo de stock (excluida de todas las recetas).
- Líquidos/grasas indicados en gramos se tratan 1 g ≈ 1 ml.
- "Panela en polvo" → insumo existente **Panela molida**; "panela"/"panela
  raspada" → insumo nuevo **Panela**.
- "Cebolla blanca" y "cebolla de huevo/cabezona" → **Cebolla cabezona blanca**.
- "Cebolla" sin especificar (ají de lulo, puré de pepitas) → se asumió la del
  contexto (roja / cabezona blanca).
- "Sal común"/"sal fina" → **Sal**; sal marina y sal rosada de cura son insumos
  aparte.
- "Ajonjolí" → **Ajonjolí blanco**. "Aguacate Hass (pulpa)" → **Aguacate**.
- "Aceite para freír (girasol o palma)" → **Aceite de girasol**.
- "Morrillo" ≡ **Posta de res** (doc: "posta o muchacho/morrillo").
- Mantequilla de setas y flan: ingredientes repetidos en el doc (mantequilla
  30+250, azúcar 150+120) se sumaron — el sistema admite un solo renglón por
  insumo por receta.
- El insumo legacy **"harina"** (minúscula) quedó sin uso — el recetario usa
  **Harina de trigo**. Limpieza pendiente de decisión admin.
- **Hogao, Refrito del pacífico y Leche de coco** se reclasificaron de materia
  prima (capa 1) a producto interno (capa 2) porque el recetario define su
  receta de producción.

## 5. Cómo aplicar correcciones

1. Editar `scripts/data/recetario-amex.mjs` (quitar `estimado: true` al validar).
2. Correr `node --test scripts/tests/` (integridad).
3. Correr `node --env-file=apps/web/.env.local scripts/seed-recetario-amex.mjs --apply`
   — idempotente: actualiza las recetas para que la DB quede exactamente como
   el archivo.
