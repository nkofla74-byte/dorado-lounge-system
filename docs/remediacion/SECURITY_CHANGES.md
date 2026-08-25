# Cambios de seguridad — remediación 2026-08-22

## 1. Los claims de autorización dejan de derivarse del signup (F-001)

`handle_new_user` copiaba `raw_user_meta_data.role` y `.tenant_id` a
`raw_app_meta_data`. El primero es el campo `data` del signup, que controla
íntegramente quien se registra; el segundo es la única fuente de verdad de
autorización de todo el sistema (`assertCan`, middleware y las 60+ políticas RLS
leen `auth.jwt() -> 'app_metadata'`).

Cualquier anónimo con la anon key pública —que viaja en el bundle JS— podía:

```js
supabase.auth.signUp({
  email,
  password,
  options: { data: { role: 'superuser', tenant_id: '<víctima>' } },
});
```

y obtener el bypass total de superuser sobre cualquier sala.

**Ahora**: el trigger no lee metadata de usuario. Los claims solo se fijan por
`fn_provisionar_claims_usuario` (rechaza el rol `superuser`, valida que el tenant
exista, solo `service_role`) o por la Admin API desde el servidor.

## 2. La base de datos autoriza por sí misma (F-002, F-006, F-036)

Antes, las invariantes vivían solo en las Server Actions mientras PostgREST
quedaba abierto con políticas `FOR ALL` cuyo `WITH CHECK` solo comprobaba
`tenant_id`. Verificado contra una base real:

| Ataque desde la consola del navegador               | Antes                                    | Ahora                   |
| --------------------------------------------------- | ---------------------------------------- | ----------------------- |
| `PATCH /pedidos {"estado":"entregado"}` como mesero | 1 fila, **stock intacto, 0 movimientos** | denegado                |
| `DELETE /pedidos` como mesero                       | 1 fila borrada                           | denegado por privilegio |
| `INSERT /lotes` como mesero (stock fantasma)        | 1 fila                                   | denegado                |
| `UPDATE /pedido_items` de otra área                 | permitido                                | denegado                |

**Ahora**:

- `rbac_permisos` + `fn_puede()` replican la matriz de permisos dentro de
  Postgres. La tabla se **genera** desde `lib/auth/permissions.ts` y una prueba
  falla si alguien cambia una sin regenerar la otra. Eso elimina la causa raíz
  RC-2 de forma estructural, no puntual.
- Cada `FOR ALL` se sustituyó por políticas de INSERT y UPDATE que evalúan el
  permiso en `USING` **y** en `WITH CHECK`.
- `REVOKE DELETE` en las 20 tablas operativas: el modelo usa borrado lógico.
- Toda la escritura de pedidos pasa por RPCs `SECURITY DEFINER` que derivan
  tenant, rol y usuario de `auth.jwt()` —nunca de parámetros, que fue el defecto
  del overload huérfano corregido en junio— y hacen su trabajo en una única
  transacción con `FOR UPDATE`.

## 3. Revocación de acceso (F-003)

Desactivar a un empleado ponía `users.activo = false` y nada más: su JWT seguía
siendo válido y el refresh token seguía renovando, así que conservaba acceso
operativo completo mientras no cerrara el navegador.

**Ahora**: `toggleUser` banea en auth (corta la renovación) y `assertCan`
contrasta cada acción con la fila del usuario. Rol o tenant que ya no coinciden
con el JWT devuelven `SESSION_STALE` y obligan a volver a entrar, en lugar de
dejar que la aplicación y la RLS discrepen en silencio.

## 4. Superficie de configuración reducida

- `SUPABASE_SERVICE_ROLE_KEY` sale del socket-server: no accede a la base y era
  la clave que puentea toda la RLS en un proceso expuesto a internet (F-027).
- La verificación HS256 legacy pasa a ser opt-in (`ALLOW_LEGACY_HS256`) y
  `SUPABASE_JWT_SECRET` deja de ser obligatorio para arrancar (F-030).
- Turnstile falla en cerrado en producción si falta el secreto (F-013).
- CSP con nonce por petición y `strict-dynamic` en lugar de `unsafe-inline`
  ciego (F-019).
- Los sockets se cierran al vencer su token (F-014).

---

## Pendiente de configuración fuera del repositorio

Estas acciones **no** están en el código y hacen falta para cerrar del todo el
riesgo. Ordenadas por urgencia:

1. **Rotar `SUPABASE_SERVICE_ROLE_KEY`** (F-027). Estuvo aprovisionada en el
   entorno del socket-server; hay que asumirla comprometida.
2. **Rotar `SUPABASE_JWT_SECRET`** una vez confirmado que el proyecto usa llaves
   asimétricas y `ALLOW_LEGACY_HS256` queda apagado (F-030).
3. **Configurar un monitor HTTP contra `/health`** en Better Stack (F-011). El
   workflow que falseaba el latido se eliminó, pero sin un check activo la
   detección de caídas depende del cron diario.

### Hechas

- **CAPTCHA nativo de Supabase Auth — activado el 2026-08-22** (F-012).
  Dashboard → Authentication → Settings → _Enable Captcha protection_.
  El login server-side impedía saltarse Turnstile **a través de la aplicación**,
  pero el endpoint `/auth/v1/token` de Supabase es público por diseño: sin el
  CAPTCHA nativo, la fuerza bruta directa seguía siendo posible.

  **Tiene contrapartida obligatoria en el código** (commit de esta remediación):
  un token de Turnstile es de un solo uso —Cloudflare responde
  `timeout-or-duplicate` a la segunda validación—, así que el login **no puede**
  validarlo contra Cloudflare y además reenviarlo. `iniciarSesion` dejó de
  llamar a `verifyTurnstile` y pasa el token en
  `signInWithPassword({ ..., options: { captchaToken } })`. El verificador es
  ahora el propio endpoint que emite la sesión. El bucket de 5 intentos/15 min
  por IP se movió a `lib/auth/login-throttle.ts` y se consume en todo intento.

  Condiciones de configuración: el proveedor elegido en Supabase debe ser
  **Cloudflare Turnstile** (no hCaptcha) y su secreto debe ser el
  `TURNSTILE_SECRET_KEY` que corresponde a `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Si
  se desactivara el CAPTCHA en Supabase, el login seguiría funcionando pero sin
  verificación anti-bot: el widget quedaría decorativo.

  `verifyTurnstile` sigue en uso —y sin cambios de comportamiento— en el camino
  QR de pasajeros, donde Supabase Auth no interviene.

- **Registro público deshabilitado — 2026-08-22** (defensa en profundidad sobre
  F-001). El fix del trigger ya impedía la escalada aunque el signup estuviera
  abierto; cerrarlo elimina además el alta de cuentas basura. No afecta al alta
  de personal, que va por `auth.admin.createUser` con la service key.

## Riesgos residuales aceptados

- **Lecturas**: las políticas de SELECT siguen siendo por tenant sin filtro de
  permiso. Estrecharlas rompería lecturas legítimas (el mesero necesita ver los
  ingredientes de la receta al entregar). El vector explotado era la escritura.
- **`undici`**: sus avisos entran por `jsdom`, dependencia de desarrollo del
  runner de pruebas. Forzar la versión parcheada rompe el entorno de test.
- **Ventana de revocación**: una acción ya en vuelo puede completarse entre la
  desactivación de un usuario y su siguiente `assertCan`.
