-- =============================================================================
-- 20260530000003_catalogo_real_dorado.sql
-- Carga del catálogo real de Dorado Lounge (El Dorado, Bogotá) y archivado del
-- catálogo demo previo. Tenant: b03fab11-83c7-481e-a892-42357152b59b.
--
-- Decisiones del dueño (2026-05-30):
--   • Solo MATERIA PRIMA de cocina (excluidos amenities COSMETIKA y terminados
--     GODDARD: sandwiches/wraps/ensaladas).
--   • Soft-delete del catálogo actual (insumos + recetas + lotes); se conserva
--     el histórico inmutable (movimientos, pedidos, tandas).
--   • Unidades g/ml/unidad (F2). Merma 0 por producto (se ajusta luego, F3).
--
-- Normalización (cantidad × costo = total del comprobante):
--   • Cárnicos/quesos/jamón/harinas/granos/azúcar/sal/pastas → g; cantidad en kg
--     o tamaño de empaque del nombre → base g; costo = costo/empaque ÷ g.
--   • Líquidos → ml. Huevos/panes/porciones → unidad.
--   • Filas con dato ruidoso/ambiguo (marcadas) se crean SIN stock (solo catálogo);
--     la cantidad/costo se cargará en la primera recepción real.
--
-- Idempotente: el soft-delete del catálogo viejo excluye los códigos nuevos; los
-- INSERT usan ON CONFLICT / NOT EXISTS. Re-ejecutar no duplica ni borra lo nuevo.
--
-- DBs frescas (preview branches sin datos): el tenant no existe, así que esta
-- migración es un no-op — los INSERT están gateados por EXISTS sobre tenants y
-- los UPDATE/JOIN no encuentran filas. Sin el gate, el INSERT a proveedores
-- viola la FK tenant_id y rompe la cadena de migraciones del branch.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _cat (
  codigo text,
  nombre text,
  unidad text,           -- g | ml | unidad
  prov   text,           -- proveedor (para el lote)
  stock  numeric,        -- cantidad neta en unidad base; NULL = solo catálogo
  costo  numeric         -- costo por unidad base; NULL = sin costo
) ON COMMIT DROP;

INSERT INTO _cat (codigo, nombre, unidad, prov, stock, costo) VALUES
  -- COMPORK
  ('00590','Carne descarga','g','COMPORK',10000,28.50),
  ('00365','Bondiola de cerdo','g','COMPORK',10000,19.50),
  ('00211','Pechuga','g','COMPORK',60000,11.40),
  ('00801','Alas de pollo','g','COMPORK',5000,9.00),
  ('00802','Harina de maíz','g','COMPORK',NULL,NULL),
  ('00707','Avena con hojuelas','g','COMPORK',NULL,NULL),
  ('00571','Frugol','unidad','COMPORK',2,18500.00),                       -- [FLAG] unidad supuesta
  ('00551','Salsa inglesa','ml','COMPORK',NULL,NULL),
  ('00619','Semillas de amapola','g','COMPORK',NULL,NULL),
  -- BIMBO
  ('00555','Pan tajado Bimbo','unidad','BIMBO',3,5667.00),
  ('00277','Tortilla de maíz Bimbo','unidad','BIMBO',NULL,NULL),
  ('00022','Arepa queso x15','unidad','BIMBO',NULL,NULL),                 -- [FLAG] dato "60 LB" ambiguo
  -- CORPOJHABA
  ('00044','Amaranto de chocolate','g','CORPOJHABA',NULL,NULL),
  ('00557','Quinua vainilla','g','CORPOJHABA',NULL,NULL),
  ('00803','Antipasto','unidad','CORPOJHABA',NULL,NULL),                  -- [FLAG] ¿terminado?
  ('00274','Huevos AA x30 und','unidad','CORPOJHABA',600,490.00),         -- 20 bandejas × 30
  ('00309','Mantequilla 10gr individual 42 und','g','CORPOJHABA',420,61.25), -- 1 caja × 42 × 10g
  ('GEN-001','Vinagre blanco','ml','CORPOJHABA',NULL,NULL),               -- [FLAG] sin código origen
  ('GEN-002','Azúcar Incauca','g','CORPOJHABA',NULL,NULL),                -- [FLAG] sin código origen
  ('00195','Pasta tornillos x500gr','g','CORPOJHABA',6000,9.88),          -- 12 × 500g
  ('00467','Cocoa 1.5KG','g','CORPOJHABA',NULL,NULL),
  -- ATLANTIA / ARROZ FEDERAL
  ('00446','Azúcar x25KG','g','ATLANTIA / ARROZ FEDERAL',100000,5.55),    -- 4 × 25kg
  ('00080','Arroz Federal','g','ATLANTIA / ARROZ FEDERAL',NULL,NULL),
  -- DIVONBASTI
  ('00127','Fresa','g','DIVONBASTI',4000,7.84),
  ('00102','Tomate chonto','g','DIVONBASTI',20000,6.37),
  ('00126','Zanahoria','g','DIVONBASTI',10000,1.47),
  ('00542','Maracuyá','g','DIVONBASTI',4000,6.37),
  ('00745','Mora','g','DIVONBASTI',2000,6.80),
  ('00543','Pepino cohombro','g','DIVONBASTI',5000,2.94),
  ('00769','Pan de leche Supermini','unidad','DIVONBASTI',1,24000.00),
  ('00770','Pan hojaldrado Supermini','unidad','DIVONBASTI',4,24000.00),
  ('00772','Pan semiintegral Supermini','unidad','DIVONBASTI',1,24000.00),
  -- LA ARTESA
  ('00616','Pan integral tajado','unidad','LA ARTESA',3,5680.00),
  ('00220','Nachos','unidad','LA ARTESA',12,22610.00),                    -- [FLAG] ¿terminado?
  -- SANDILU
  ('00218','Hojuela azucarada 1KG','g','SANDILU',1000,14.20),
  ('00219','Cereal arroz achocolatado 1KG','g','SANDILU',1000,14.20),
  ('00381','Granola x1000GR MX12 surtida','g','SANDILU',NULL,NULL),
  ('00407','Queso tajado mozzarella','g','SANDILU',5000,72.50),           -- [FLAG] ¿cantidad = kg?
  ('00505','Queso tajado cheddar','g','SANDILU',1000,72.50),
  ('00314','Queso campesino bloque','g','SANDILU',5000,56.00),
  ('00532','Jamón bloque','g','SANDILU',8000,67.50),
  ('00321','Jamón de pollo tajado','g','SANDILU',5000,48.60),
  ('00531','Chorizo de cerdo','g','SANDILU',3000,39.50),
  ('00011','Salchicha','g','SANDILU',4000,23.20),
  ('00875','Kumis','ml','SANDILU',2000,7.45),                             -- [FLAG] 2 L supuesto
  ('00028','Salsa mostaza','ml','SANDILU',NULL,NULL),
  ('00420','Salsa de soya','ml','SANDILU',NULL,NULL),
  -- SURTINEGOCIOS / LEVAPAN
  ('00695','Harina de centeno','g','SURTINEGOCIOS / LEVAPAN',NULL,NULL),  -- [FLAG] total $0
  ('00031','Uva pasa','g','SURTINEGOCIOS / LEVAPAN',NULL,NULL),           -- [FLAG] total inconsistente
  ('00311','Sal x10gr *500 und','g','SURTINEGOCIOS / LEVAPAN',5000,7.34), -- 1 × 500 × 10g
  ('00413','Polvo de hornear x5KG','g','SURTINEGOCIOS / LEVAPAN',NULL,NULL),
  ('00029','Sal x 3KG','g','SURTINEGOCIOS / LEVAPAN',NULL,NULL),
  ('00414','Esencia de vainilla','ml','SURTINEGOCIOS / LEVAPAN',NULL,NULL),
  ('00620','Esencia de banano','ml','SURTINEGOCIOS / LEVAPAN',NULL,NULL),
  ('00621','Esencia de arequipe','ml','SURTINEGOCIOS / LEVAPAN',NULL,NULL),
  ('00331','Margarina multipropósito Honora x15KG','g','SURTINEGOCIOS / LEVAPAN',15000,7.86),
  ('00654','Leche condensada','ml','SURTINEGOCIOS / LEVAPAN',NULL,NULL),  -- [FLAG] costo alto p/1
  ('00635','Pasta de tomate','g','SURTINEGOCIOS / LEVAPAN',NULL,NULL),    -- [FLAG]
  ('00476','Gelatina sin sabor','g','SURTINEGOCIOS / LEVAPAN',NULL,NULL), -- [FLAG] inconsistente
  ('00475','Gelatina 3 sabores 1KG','g','SURTINEGOCIOS / LEVAPAN',NULL,NULL),
  ('00650','Arequipe por 5KG','g','SURTINEGOCIOS / LEVAPAN',5000,16.27),  -- 1 × 5kg
  ('00646','Levadura 500GR','g','SURTINEGOCIOS / LEVAPAN',NULL,NULL),
  ('00033','Salsa mayonesa del campo x3.8KG','g','SURTINEGOCIOS / LEVAPAN',NULL,NULL),
  ('00667','Azúcar micropulverizada Levapan x5KG','g','SURTINEGOCIOS / LEVAPAN',NULL,NULL);

-- ── 1) Proveedores (idempotente por nombre activo) ───────────────────────────
INSERT INTO public.proveedores (id, tenant_id, nombre, activo)
SELECT gen_random_uuid(), 'b03fab11-83c7-481e-a892-42357152b59b', p.nombre, true
FROM (SELECT DISTINCT prov AS nombre FROM _cat) p
WHERE EXISTS (
  SELECT 1 FROM public.tenants t
  WHERE t.id = 'b03fab11-83c7-481e-a892-42357152b59b'
)
AND NOT EXISTS (
  SELECT 1 FROM public.proveedores x
  WHERE x.tenant_id = 'b03fab11-83c7-481e-a892-42357152b59b'
    AND x.nombre = p.nombre
    AND x.deleted_at IS NULL
);

-- ── 2) Soft-delete del catálogo demo previo ──────────────────────────────────
-- Insumos: todo lo activo cuyo código NO esté en el catálogo nuevo.
UPDATE public.insumos
SET deleted_at = now()
WHERE tenant_id = 'b03fab11-83c7-481e-a892-42357152b59b'
  AND deleted_at IS NULL
  AND codigo NOT IN (SELECT codigo FROM _cat);

-- Lotes: los de insumos que NO pertenecen al catálogo nuevo (preserva los nuevos
-- en re-ejecuciones; en la primera corrida aún no existen insumos nuevos).
UPDATE public.lotes
SET deleted_at = now()
WHERE tenant_id = 'b03fab11-83c7-481e-a892-42357152b59b'
  AND deleted_at IS NULL
  AND insumo_id NOT IN (
    SELECT id FROM public.insumos
    WHERE tenant_id = 'b03fab11-83c7-481e-a892-42357152b59b'
      AND codigo IN (SELECT codigo FROM _cat)
  );

-- Recetas: se archivan todas (el catálogo cambió por completo). No se insertan
-- recetas nuevas aquí, así que es idempotente.
UPDATE public.recetas
SET deleted_at = now()
WHERE tenant_id = 'b03fab11-83c7-481e-a892-42357152b59b'
  AND deleted_at IS NULL;

-- ── 3) Insumos del catálogo real (idempotente por (tenant, codigo)) ──────────
INSERT INTO public.insumos
  (id, tenant_id, nombre, codigo, capa, unidad_medida, stock_minimo, merma_default, activo)
SELECT gen_random_uuid(), 'b03fab11-83c7-481e-a892-42357152b59b',
       c.nombre, c.codigo, 'capa_1', c.unidad::public.unidad_medida, 0, 0, true
FROM _cat c
WHERE EXISTS (
  SELECT 1 FROM public.tenants t
  WHERE t.id = 'b03fab11-83c7-481e-a892-42357152b59b'
)
ON CONFLICT (tenant_id, codigo) DO NOTHING;

-- ── 4) Lotes con stock (idempotente por (insumo, codigo de lote)) ────────────
INSERT INTO public.lotes
  (id, tenant_id, insumo_id, codigo, cantidad_inicial, cantidad_actual,
   costo_unitario, proveedor_id, fecha_recibido, activo)
SELECT gen_random_uuid(), 'b03fab11-83c7-481e-a892-42357152b59b',
       i.id, c.codigo || '-L1', c.stock, c.stock, c.costo, pr.id, now(), true
FROM _cat c
JOIN public.insumos i
  ON i.tenant_id = 'b03fab11-83c7-481e-a892-42357152b59b' AND i.codigo = c.codigo
LEFT JOIN public.proveedores pr
  ON pr.tenant_id = 'b03fab11-83c7-481e-a892-42357152b59b'
     AND pr.nombre = c.prov AND pr.deleted_at IS NULL
WHERE c.stock IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.lotes l
    WHERE l.tenant_id = 'b03fab11-83c7-481e-a892-42357152b59b'
      AND l.insumo_id = i.id
      AND l.codigo = c.codigo || '-L1'
  );

COMMIT;
