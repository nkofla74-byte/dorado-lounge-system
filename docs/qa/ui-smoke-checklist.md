# UI Smoke Checklist — Pruebas manuales por rol

Checklist de pruebas manuales pre-deploy. Una corrida completa = login con cada rol, recorrer golden path + edge cases listados. Marcar `[x]` al pasar.

**Setup previo**

- [ ] `pnpm reset:test-users` (set canónico idempotente).
- [ ] `pnpm dev` corriendo (web + socket-server).
- [ ] Browser limpio (sin sesión previa) — preferible incógnito.
- [ ] DevTools abierto: pestaña Console (errores JS) + Network (4xx/5xx).
- [ ] Verificar idioma: alternar ES/EN al menos una vez por rol y confirmar que no hay strings hardcoded.

**Convención de severidad al reportar**

- 🔴 Bloqueante (no se puede usar la feature)
- 🟡 Funcional pero con regresión (UX rota, falta i18n, error en consola)
- 🟢 Cosmético

---

## 1. `superuser` → `/admin/tenants`

Golden path:

- [ ] Login como superuser → redirige a `/admin/tenants`.
- [ ] Lista de tenants carga (al menos el tenant demo).
- [ ] Crear tenant nuevo → aparece en la lista sin recargar.
- [ ] Editar tenant existente (nombre/slug) → cambios persisten tras F5.
- [ ] Crear usuario en tenant → email + rol + tenant_id se setean correctamente.
- [ ] Cambiar rol de usuario existente → el cambio se refleja al re-loguear ese user.

Edge cases:

- [ ] Crear tenant con slug duplicado → error claro, no 500.
- [ ] Soft-delete tenant → desaparece de la lista pero queda en DB (`deleted_at`).
- [ ] Auditoría visible: cada acción genera entrada en `audit_log` (verificar en DB o vista admin).

---

## 2. `admin` → `/inventario`

Golden path:

- [ ] Login como admin → panel completo accesible.
- [ ] Sidebar muestra todas las secciones: almacén, recetas, costos, KDS monitor, producción, pedidos, analíticos, proveedores, alertas.
- [ ] **Inventario**: lista insumos + lotes con FEFO ordenado por vencimiento.
- [ ] **Recetas**: crear receta con ingredientes y `merma_coeficiente`. Costo en tiempo real visible.
- [ ] **Costos**: `fn_costo_receta` devuelve valor coherente (ingredientes × precio lote actual).
- [ ] **Producción**: ver tandas activas, despachos pendientes.
- [ ] **Pedidos AMEX**: ver tablero estado (creado → recibido → en_preparacion → despachado → entregado).
- [ ] **Analíticos**: KPIs `cogs_per_passenger` + `cash_outflow_per_passenger` con filtros (turno, nodo, responsable, período).
- [ ] **Proveedores**: CRUD funcional, historial compras por proveedor.
- [ ] **Alertas**: lista alertas activas + leídas, marcar como leídas.

Edge cases:

- [ ] Crear receta sin merma → debe rechazar (Principio Rector).
- [ ] Editar precio de lote → si cambio > X% dispara alerta visible para admin.
- [ ] Filtrar analíticos por turno cerrado vs abierto.
- [ ] Real-time: dejar pestaña admin abierta + disparar evento desde cocina → notificación llega sin recargar.

---

## 3. `chef` → `/cocina`

Golden path:

- [ ] Login como chef → cola FIFO carga con tickets de Snack + Buffet + Sala.
- [ ] Cada ticket muestra: zona origen, items, tiempo en cola.
- [ ] Despachar ticket → descuento FEFO automático (verificar en `/inventario` que el stock bajó).
- [ ] Receta con merma > 0 → el descuento bruto = `requerida / (1 - coef)`.

Edge cases:

- [ ] Despachar item sin stock suficiente → error claro, no descuento parcial.
- [ ] Doble click rápido en "despachar" → idempotencia respetada (`idempotency_key`), no doble descuento.
- [ ] Conexión Socket.io cae → tickets siguen visibles (persistencia primero), reconciliación al reconectar.

---

## 4. `sous_chef` → `/cocina-amex`

Golden path:

- [ ] Login → cola exclusiva AMEX (sin tickets de otras zonas).
- [ ] Cada pedido muestra timer visible desde `recibido_cocina`.
- [ ] Transición de estados: `recibido_cocina → en_preparacion → despachado`.
- [ ] Trazabilidad: `pedido_eventos` registra cada cambio con usuario + timestamp.
- [ ] Optimistic locking: si dos sous_chef abren el mismo pedido, el segundo `update` falla con mensaje claro.

Edge cases:

- [ ] Timer cruza umbral de demora → alerta visible para chef AMEX + mesero.
- [ ] Cancelar pedido en preparación → estado válido, no descuenta stock.

---

## 5. `mesero_amex` → `/pedidos`

Golden path:

- [ ] Login → carta QR completa visible + extras pastelería + extras jefe turno.
- [ ] Crear pedido nuevo con 2+ items → entra a cola `cocina_amex` con estado `creado`.
- [ ] Recibir notificación cuando cocina marca `despachado`.
- [ ] Confirmar entrega → estado `entregado` + descuento de stock dispara (FEFO).

Edge cases:

- [ ] Cancelar pedido antes de despacho → sin descuento de stock.
- [ ] Confirmar entrega de pedido ya entregado → bloqueado por optimistic lock.
- [ ] i18n carta: cambiar locale (es/en) → strings de items traducidos.

---

## 6. `recepcion` → `/afluencia`

Golden path:

- [ ] Login → form de registro de ingresos visible.
- [ ] **Apertura de turno**: campos obligatorios `teamlider` + `login_time` + rol → no permite continuar si falta `teamlider`.
- [ ] Registrar ingreso de pasajero (manual o por scan).
- [ ] Ver contador de pasajeros del turno en vivo.
- [ ] **Cierre de turno**: setea `logout_time`, todos los registros quedan vinculados al turno.

Edge cases:

- [ ] Intentar abrir 2 turnos simultáneos con mismo usuario → rechazado.
- [ ] Ingresos del turno se ven en analíticos (admin) filtrados por turno.

---

## 7. `personal_snack` → `/snack`

Golden path:

- [ ] Login → vista Snack con pendientes propios.
- [ ] Notificar a cocina (pedir preparación) → ticket aparece en cola `chef`.
- [ ] Pedir menaje → notificación a steward.
- [ ] Stock Out de un item servido → descuento FEFO inmediato.

Edge cases:

- [ ] Stock Out con `idempotency_key` duplicado → segundo intento no descuenta dos veces.
- [ ] Sin stock en zona → notificación clara, no negative stock.

---

## 8. `personal_buffet` → `/buffet`

Golden path:

- [ ] Login → vista Buffet + stock local visible.
- [ ] Notificar cocina + pedir preparación (como Snack).
- [ ] Despachar lote a buffet → descuento al despachar.
- [ ] **Conciliación al cierre de turno**: tickets por turno (`buffet_tickets_turno`) reflejan consumo real.

Edge cases:

- [ ] Cierre de turno sin conciliar → warning visible.
- [ ] Stock local desactualizado tras evento Socket.io → refrescar y comparar con DB.

---

## 9. `personal_almacen` → `/almacen`

Golden path:

- [ ] Login → recepción de lotes accesible.
- [ ] Registrar lote nuevo: insumo + cantidad + fecha vencimiento + proveedor + precio.
- [ ] Lote aparece en FEFO de `/inventario` para admin.
- [ ] Ver alertas: stock mínimo + vencimientos próximos + cambios de precio.
- [ ] Historial de compras por proveedor visible.

Edge cases:

- [ ] Lote con fecha vencimiento < hoy → warning pero permite registrar (caso uso real).
- [ ] Precio nuevo > X% vs último lote → dispara alerta para admin.
- [ ] Proveedor inexistente → forzar crear primero o autocomplete.

---

## 10. `personal_pasteleria` → `/pasteleria`

Golden path:

- [ ] Login → producción pastelería accesible.
- [ ] Crear tanda producción: receta Capa 1→2, cantidad, merma aplicada.
- [ ] Costo por unidad visible en tiempo real.
- [ ] Despachar a zona (snack/buffet/amex) → descuento FEFO + ingreso en zona destino.

Edge cases:

- [ ] Tanda sin ingredientes suficientes → bloqueada, lista insumos faltantes.
- [ ] Despachar a zona sin permiso ACL → rechazado, evento de seguridad en `audit_log`.

---

## 11. `steward` → `/produccion`

Golden path:

- [ ] Login → gestión utensilios visible.
- [ ] Registrar entrega/devolución de utensilios.
- [ ] Recibir notificaciones de Snack/Buffet pidiendo menaje.

Edge cases:

- [ ] Devolución de utensilio no entregado → rechazado.

---

## 12. Anónimo (QR) → `/qr/[locale]`

Golden path:

- [ ] Acceder a `/qr/es` (sin login).
- [ ] Carta carga con fotos + ingredientes + descripciones.
- [ ] Cambiar locale: `/qr/en`, `/qr/fr`, `/qr/pt` → strings traducidos.
- [ ] Pedir item → token JWT pasajero (`JWT_PASSENGER_SECRET`) generado con TTL 4h.
- [ ] Pedido entra a cola correspondiente (Snack/Buffet/AMEX según mesa).

Edge cases:

- [ ] Token QR expirado → re-scan obligatorio.
- [ ] Locale inválido (`/qr/zz`) → fallback a `es`.
- [ ] Sin sesión Turnstile → captcha visible antes de enviar pedido.
- [ ] Spam de pedidos → rate limit Upstash bucket pasajero corta.

---

## Cross-cutting (al final de la corrida)

- [ ] **i18n**: cero strings hardcoded encontrados. Todos via `useTranslations`.
- [ ] **Console**: cero errores JS rojos en ningún rol.
- [ ] **Network**: cero 4xx/5xx inesperados (401 al cerrar sesión es ok).
- [ ] **Real-time**: dejar 2 pestañas abiertas con roles que comparten canal → eventos llegan a ambas.
- [ ] **ACL Socket.io**: intentar suscribirse a canal sin permiso (DevTools) → desconexión inmediata + entrada en `audit_log`.
- [ ] **Rate limit**: bombardear endpoint login con 11 intentos → bucket Upstash corta al 11º.
- [ ] **Audit log**: toda Server Action de escritura genera entrada con `actor + tenant + payload`.
- [ ] **Hash chain**: intentar UPDATE manual a `audit_log` desde SQL → trigger bloquea.
- [ ] **Soft delete**: ningún DELETE físico (excepto `audit_log`/`domain_events` que no permiten ni UPDATE).
