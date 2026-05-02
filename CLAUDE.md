# CLAUDE.md — Dorado Lounge System

Sistema SaaS de gestión integral para sala VIP aeroportuaria 24/7. Cliente: **GISAT S.A.** (Dorado Lounge, Aeropuerto El Dorado, Bogotá). El código es propiedad del desarrollador; el cliente adquiere licencia de uso.

📄 Documento de análisis completo: `docs/analisis-v6.docx`

---

## 🛠 Stack (no cambiar sin discutir)

```
Next.js 14 (App Router) + TypeScript    → Framework
React + Tailwind CSS                    → UI (dark/light auto)
Supabase (PostgreSQL + Auth + Storage)  → DB + Auth + archivos
Socket.io                               → Real-time (KDS + chat por nodos)
Zod + React Hook Form                   → Validaciones
next-intl                               → i18n del QR pasajero (es/en/fr/pt)
Vercel + Render.com                     → Deploy (front / socket server)
```

> Mismo stack y patrones que el repo `jrxdevs-sistemas`. Reusar `middleware.ts`, estructura de módulos con `actions.ts`, validaciones con Zod.

---

## 🧭 Principio rector — INVIOLABLE

**Nada sale de cocina sin receta.** Todo movimiento de inventario está vinculado a una receta con `merma_coeficiente`. No existe descuento sin receta. Si algo no encaja en este modelo, **detenerse y preguntar antes de codificar**.

---

## 🏗 Arquitectura del inventario

**Dos capas:**
- `capa_1` — Materia prima de bodega (harina, pollo, queso…)
- `capa_2` — Producción interna (pandebonos, ensaladas, salsas…)

**Dos tipos de receta:**
- `receta_produccion` — Capa 1 → Capa 2 (chef registra batch)
- `receta_servicio` — Capa 1/2 → Zona (al despachar o al confirmar entrega)

**Coeficiente de merma** se aplica automático en cada descuento:
```
descuento = cantidad_requerida / (1 - merma_coeficiente)
```

**5 categorías de pérdida** (obligatorio categorizar al detectar diferencia): `retraso_entrega`, `robo_faltante` *(requiere aprobación admin)*, `vencimiento`, `desperdicio_proceso`, `descarte_accidental`.

---

## 🏢 Tres zonas de servicio

| Zona | Modelo | Descuento de inventario |
|---|---|---|
| **Amex** | Mesero + KDS + QR pasajero (i18n) | Al confirmar entrega del pedido |
| **Snack** | Autoservicio | Al despachar desde cocina con receta |
| **Buffet** | Lote + tickets | Al despachar lote a buffet. Conciliación al cierre con total de tickets recolectados |

> **Buffet NO registra consumo individual en tiempo real.** Esa decisión ya se tomó: `1 ticket = 1 servicio`, ingresado al cierre del turno.

---

## 📡 Real-time — Topología jerárquica (Socket.io)

```
SuperUser ──── Admin
                │
              COCINA  ←─ nodo central, broadcast permitido
            ╱   │   ╲
         AMEX  SNACK  BUFFET   ←─ nodos servicio
                                  solo hablan con Cocina/Admin
```

**Canales:** `sala:cocina` · `sala:amex` · `sala:snack` · `sala:buffet` · `sala:admin` · `sala:stuart` (logística de utensilios) · `sala:broadcast` (solo cocina puede emitir).

**Reglas:**
- Nodos de servicio ↔ entre sí: ❌ prohibido
- Cada nodo de servicio tiene **botón Stock Out** (1 toque) → Cocina + Admin
- Cada nodo de servicio tiene **canal Stuart** independiente para activos
- JWT verificado en handshake; middleware valida rol vs permiso de canal

---

## 👥 Roles (RBAC configurable desde SuperUser)

| Rol | Acceso |
|---|---|
| `superuser` | God Mode: CRUD usuarios, config UI por rol, multi-tenant, auditoría |
| `admin` | Operación completa: carta, recetas, inventario, proveedores, reportes |
| `chef` / `sous_chef` | Producción batch, despacho, KDS, chat |
| `mesero_amex` | Pedidos por mesa, confirmación, chat con cocina |
| `personal_snack` | Stock Out, Stuart, conteo de cierre |
| `personal_buffet` | Stock Out, Stuart, registro de tickets |

---

## 📁 Estructura de carpetas

```
src/
├── app/
│   ├── (auth)/        ├── (superuser)/   ├── (admin)/
│   ├── (cocina)/      ├── (amex)/        ├── (snack)/
│   ├── (buffet)/      └── (qr)/          ← público, i18n
├── components/        → kds, chat, inventory, production, reports, ui
├── lib/
│   ├── supabase/      → client.ts, server.ts, admin.ts (mismo patrón jrxdevs)
│   ├── socket/        → cliente y middleware de canales
│   ├── auth/          → guards, RBAC matrix
│   └── merma/         → motor de cálculo de coeficientes
└── modules/           → un actions.ts por dominio (mismo patrón jrxdevs)
    inventory · production · orders · buffet · analytics
    afluencia · chat · providers · users
```

---

## 🔐 Variables de entorno

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SOCKET_URL=        # Render.com socket server
FLIGHTS_API_KEY=               # API vuelos El Dorado
FLIGHTS_API_URL=
```

---

## ✅ Convenciones

- **Código en inglés**, **UI en español**
- Mutaciones → Server Actions con Zod + `'use server'`
- Lecturas → Supabase client directo (server o client según caso)
- Validaciones en `lib/validations/*.ts` (mismo patrón jrxdevs)
- Operaciones críticas (Stock Out, despacho, ticket) → máximo **3 toques**
- **Sin secrets en el código.** Todo en `.env.local` (nunca commit)
- Repositorio **privado** en GitHub
- Commits descriptivos en español. Ramas: `feature/<modulo>`

---

## 🧱 Módulos clave de DB (referencia rápida)

`tenants` · `users` · `insumos` · `lotes` · `recetas_produccion` (+ ingredientes) · `recetas_servicio` (+ ingredientes) · `tandas_produccion` · `despachos` · `pedidos` (+ items) · `buffet_tickets_turno` · `mermas` · `mensajes_chat` · `afluencia` · `turnos`

> Esquema SQL detallado se construye en migraciones de Supabase durante Sprint 1-2. No improvisar tablas; consultar el modelo E-R antes de crear migraciones.

---

## 📊 Analytics Engine — métrica clave

```
Producto gastado  ↔  Platos elaborados  ↔  Producción por turno
```
Filtros obligatorios en cada reporte: **turno, nodo, responsable, período**.

**Costo por usuario** (módulo afluencia):
```
costo_usuario = gasto_insumos_periodo / pasajeros_ingresados_periodo
```
Granularidad: hora / turno / día / semana / mes.

---

## 🚦 Decisiones ya tomadas (no re-discutir)

| Tema | Decisión |
|---|---|
| Real-time | Socket.io (no Supabase Realtime) — control granular de canales |
| Buffet | Lotes + tickets (no registro individual) |
| Merma | Coeficiente por receta + categorización al cierre |
| Multi-tenant | Datos aislados por `tenant_id` en cada tabla |
| QR pasajero | PWA pública con i18n, sin login |
| Disponibilidad | 24/7, sin mantenimiento en horas pico |
| Propiedad | Código del desarrollador, cliente con licencia de uso |

---

## ⚠️ Reglas para Claude

1. **Antes de tocar inventario o recetas**, releer la sección "Principio rector".
2. **Antes de crear un canal Socket.io nuevo**, verificar la topología jerárquica.
3. **Antes de agregar un rol**, revisar si se puede resolver con permisos del SuperUser.
4. **Antes de crear una tabla**, consultar la lista de módulos de DB y el esquema existente.
5. Si algo del documento `docs/analisis-v6.docx` contradice este archivo, **este archivo manda**. Si hay duda real, preguntar.
6. No sugerir cambios de stack ni de decisiones de la tabla anterior sin pedirlo explícitamente.

---

*v2.0 — Mayo 2025 · Mismo stack que `jrxdevs-sistemas` · 6 meses de desarrollo*
