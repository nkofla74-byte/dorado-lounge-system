# Post-fix smoke test

Fecha: 2026-05-18

Objetivo: validar la tanda de fixes de seguridad/compatibilidad antes de promover a produccion.

## 1. Validacion local

Ejecutar:

```bash
pnpm --recursive --if-present typecheck
pnpm --recursive --if-present test
pnpm --filter @dorado/web build
pnpm audit --prod
```

Resultado esperado:

- Typecheck: sin errores.
- Tests unitarios: sin fallos.
- Build web: genera rutas sin fallar en validacion de tipos Next.
- Audit: `No known vulnerabilities found`.

## 2. Migracion Supabase

Este repo no usa Supabase local. Las migraciones se aplican por la integracion GitHub-Supabase:

1. Abrir PR con los cambios en `supabase/migrations/`.
2. Confirmar que Supabase crea preview branch.
3. Revisar que la preview DB aplique:
   - `20260518000003_fix_pedido_estado_recibido_cocina.sql`
4. Al mergear a `main`, Supabase aplica la migracion a produccion.

Validacion SQL esperada:

```sql
SELECT enum_range(NULL::public.estado_pedido);
```

Debe incluir `recibido_cocina`.

Prueba de transicion:

```sql
-- En staging/preview, con un pedido creado de prueba:
UPDATE public.pedidos
SET estado = 'recibido_cocina'
WHERE id = '<pedido_id>' AND estado = 'creado';
```

Debe completar sin `check_violation`.

## 3. Smoke AMEX

1. Login como usuario `sous_chef` o admin.
2. Crear o ubicar un pedido AMEX en estado `creado`.
3. Abrir `/cocina-amex`.
4. Ejecutar:
   - `creado -> recibido_cocina`
   - `recibido_cocina -> en_preparacion`
   - `en_preparacion -> despachado`
5. Abrir vista de pedidos y verificar estado actualizado.
6. Revisar tabla/eventos de pedido si aplica.

Resultado esperado: no hay error de transicion invalida.

## 4. Smoke QR

Precondicion de produccion/staging:

- `UPSTASH_REDIS_REST_URL` configurado.
- `UPSTASH_REDIS_REST_TOKEN` configurado.
- `JWT_PASSENGER_SECRET` configurado.

Flujo:

1. Generar QR desde `/admin/qr`.
2. Abrir `/qr/es?t=<token>`.
3. Crear pedido normal.
4. Repetir desde la misma mesa/IP hasta superar 6 pedidos en 10 minutos.

Resultado esperado:

- Los primeros pedidos validos se crean.
- Al superar el limite, el backend rechaza con mensaje de demasiados pedidos.
- Si Upstash falta en produccion, login/QR/GDPR quedan fail-closed.

## 5. Smoke socket `/emit`

1. Levantar socket server.
2. Emitir evento valido desde la app web.
3. Confirmar que llega al canal esperado.
4. Probar payload invalido:
   - `tenantId` no UUID.
   - `channel` inexistente.
   - `event` sin `type` o sin `payload`.

Resultado esperado:

- Payload valido: HTTP 200.
- Payload invalido: HTTP 400.
- Body mayor a 64 KB: HTTP 413.
- Token incorrecto: HTTP 401.
