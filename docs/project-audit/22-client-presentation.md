# 22 · El sistema explicado para el cliente

> Este documento evita el lenguaje técnico. Está pensado para leerse sin conocimientos de
> programación.

---

## ¿Qué es este software?

Es el sistema que gestiona el día a día de la sala VIP del aeropuerto El Dorado: **desde que
la mercancía entra por la bodega hasta que el plato llega al pasajero**, pasando por las
recetas, la producción en cocina y el control de costes.

Está pensado para funcionar 24 horas al día, con turnos rotativos, sobre tabletas que el
personal maneja con guantes.

Es un sistema **multi-sala**: la misma instalación puede atender a varias salas a la vez sin
que ninguna vea los datos de las demás. Esa separación no depende de la aplicación: está
grabada en la propia base de datos, que es el sitio más difícil de eludir.

---

## ¿Cuál es su objetivo?

Responder con exactitud a tres preguntas que hoy, sin sistema, se responden a ojo:

1. **¿Qué tengo?** — Cuánto queda de cada insumo, en qué lotes, con qué fecha de vencimiento
   y a qué precio se compró.
2. **¿Qué gasté?** — Cuánto cuesta realmente cada plato, calculado con el precio de los lotes
   que efectivamente se usaron.
3. **¿Quién hizo qué y cuándo?** — Cada pedido, cada movimiento de inventario y cada
   despacho queda vinculado a un turno y a una persona.

---

## La regla que gobierna todo

> **Nada sale de cocina sin receta.**

Ningún gramo de producto puede salir del inventario si no está justificado por una receta.
No hay atajos, ni siquiera para un administrador: la regla está grabada en la base de datos y
existe una prueba automática que verifica que sigue siendo imposible saltársela.

La merma —lo que se pierde al limpiar, pelar o cortar— se descuenta **una sola vez**, en el
momento de recibir la mercancía. A partir de ahí, el inventario refleja siempre lo que
realmente se puede cocinar.

---

## ¿Qué módulos tiene?

| Módulo                   | Qué hace                                                                                  | Estado         |
| ------------------------ | ----------------------------------------------------------------------------------------- | -------------- |
| **Bodega**               | Recepción de lotes con proveedor, precio y vencimiento. Alertas de stock bajo y caducidad | ✅ Terminado   |
| **Recetario**            | Recetas de producción interna y de servicio, con sus ingredientes                         | ✅ Terminado   |
| **Costos**               | Coste real de cada plato, calculado al momento                                            | ✅ Terminado   |
| **Producción**           | Tandas de elaboración: lo que la cocina prepara para tener listo                          | ✅ Terminado   |
| **Pedidos**              | Toma de pedidos desde tres zonas: AMEX, Snack y Buffet                                    | ✅ Terminado   |
| **Cocina (4 pantallas)** | Una pantalla por área: cocina caliente, cocina fría, pastelería y AMEX                    | ✅ Terminado   |
| **Requisiciones**        | La cocina pide insumos al almacén y el almacén los despacha                               | ✅ Terminado   |
| **Turnos**               | Apertura y cierre de turno con jefe de turno obligatorio                                  | ✅ Terminado   |
| **Carta QR**             | Menú digital para el pasajero, sin instalar nada, en 4 idiomas                            | ✅ Terminado   |
| **Proveedores**          | Ficha de proveedor e historial de compras                                                 | ✅ Terminado   |
| **Trazabilidad**         | Historial completo de cada pedido: quién, cuándo, qué                                     | ✅ Terminado   |
| **Administración**       | Alta de personal, roles, gestión de salas                                                 | ✅ Terminado   |
| **Alertas**              | Avisos de stock, vencimiento, cambio de precio y demora                                   | 🟡 A medias    |
| **Analítica**            | Informes de consumo por turno                                                             | ⛔ No funciona |

---

## ¿Qué puede hacer hoy el sistema?

**Todo el circuito operativo de la sala funciona.** En concreto:

- El **almacenero** recibe mercancía, registra lotes con su vencimiento y precio, ve qué está
  por caducar y qué está bajo mínimos, y despacha lo que le piden desde cocina.
- El **cocinero de cada área** ve en su pantalla solo los platos que le corresponden, con un
  cronómetro por pedido que cambia de color si se demora. Marca cada plato como iniciado o
  listo, y puede devolverlo a preparación si hace falta.
- El **mesero** toma el pedido en la tableta y confirma la entrega. **En ese momento exacto**
  el sistema descuenta del inventario todos los ingredientes, cogiendo siempre los lotes que
  vencen antes.
- El **pasajero** escanea el QR de su mesa y pide desde su móvil, en español, inglés, francés
  o portugués, sin instalar nada. Si se queda sin cobertura, el pedido se guarda y se envía
  solo al recuperar la red, sin duplicarse.
- El **administrador** da de alta personal, gestiona proveedores y recetas, consulta el coste
  de cada plato y revisa la trazabilidad completa de cualquier pedido.

---

## ¿Cómo funciona?

Cada empleado entra con su usuario y llega **directamente a su pantalla**: el cocinero de
cocina caliente a su tablero, el almacenero a bodega, el mesero a pedidos. No ve nada que no
le corresponda, y esa restricción no depende de esconder botones: está aplicada en el
servidor y en la base de datos.

Antes de poder trabajar, todo empleado debe **abrir turno** indicando quién es el jefe de
turno. Sin turno abierto, el sistema no deja operar. Todo lo que ocurre después queda
vinculado a ese turno.

Cuando un pedido se crea, aparece **al instante** en la pantalla de cocina que corresponda,
sin que nadie tenga que refrescar nada.

---

## ¿Qué usuarios existen?

| Usuario                     | Qué ve                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| Administrador               | Todo lo de su sala: inventario, recetas, costes, personal, informes |
| Jefe de cocina AMEX         | Su pantalla exclusiva de pedidos AMEX, con tiempos y trazabilidad   |
| Cocinero de cocina caliente | Su cola de platos calientes                                         |
| Cocinero de cocina fría     | Su cola de platos fríos                                             |
| Personal de pastelería      | Su producción y su cola de postres                                  |
| Mesero AMEX                 | Toma de pedidos y confirmación de entrega                           |
| Personal de almacén         | Bodega, recepción, alertas y requisiciones                          |
| Personal de Snack           | Solo los pedidos de la zona Snack                                   |
| Personal de Buffet          | Solo los pedidos de la zona Buffet                                  |
| Steward                     | Gestión de utensilios y producción                                  |
| Superusuario                | Gestión de todas las salas (rol del proveedor del software)         |
| Pasajero (QR)               | Solo la carta de su mesa. Sin usuario ni contraseña                 |

---

## ¿Qué procesos automatiza?

- **Descuento de inventario**: al entregar un pedido, se descuentan solos todos los
  ingredientes, siempre de los lotes que vencen antes.
- **Cálculo de merma**: se aplica automáticamente al recibir la mercancía.
- **Cálculo de costes**: el coste de un plato se recalcula solo cuando cambia el precio de
  compra de sus ingredientes.
- **Cierre de turnos**: los turnos vencidos se cierran solos cada 15 minutos.
- **Revisión de alertas**: cada 5 minutos el sistema revisa vencimientos y demoras.
- **Copia de seguridad**: diaria, cifrada, con verificación de que no está vacía.

---

## ¿Qué información administra?

Insumos y lotes con su vencimiento, precio y proveedor · Recetas e ingredientes · Pedidos
completos con su historial paso a paso · Movimientos de inventario · Turnos y responsables ·
Requisiciones entre cocina y almacén · Proveedores y compras · Alertas · Personal y roles ·
Un registro de auditoría que **no se puede modificar ni borrar**, ni siquiera desde dentro del
sistema.

---

## ¿Qué está terminado?

**18 funcionalidades completas**, entre ellas todo el circuito de bodega → cocina → sala.

Estas son las comprobaciones que se hicieron ejecutando el sistema de verdad, no leyendo
documentación:

| Comprobación                                    | Resultado                       |
| ----------------------------------------------- | ------------------------------- |
| El programa compila y arranca                   | ✅ Sí                           |
| Genera las 29 pantallas y servicios previstos   | ✅ Sí                           |
| Las 567 pruebas automáticas                     | ✅ **Todas pasan**              |
| Las 80 actualizaciones de la base de datos      | ✅ Se aplican sin un solo error |
| Las 12 pruebas de seguridad contra la base real | ✅ **Todas pasan**              |
| Un usuario sin sesión no puede entrar           | ✅ Comprobado                   |

---

## ¿Qué está en desarrollo o a medias?

| Módulo                          | Qué falta                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Alertas**                     | Se generan y se guardan bien, pero **no aparecen solas en pantalla**: hay que recargar la página o abrir la campana para verlas |
| **Pedidos por QR**              | Funcionan, pero un postre pedido por QR no hace sonar la pantalla de pastelería                                                 |
| **Modo sin conexión**           | Funciona para el pasajero; el personal aún no puede trabajar sin red                                                            |
| **Recetas**                     | Se pueden crear, pero no editar ni eliminar desde la interfaz                                                                   |
| **Inventario físico**           | No hay pantalla para hacer conteos y corregir diferencias                                                                       |
| **Fotos de los platos**         | Hay que pegar la dirección de la imagen a mano; no se pueden subir                                                              |
| **Borrado de datos personales** | Borra el correo pero deja el nombre                                                                                             |

---

## ¿Qué no funciona?

**La pantalla de Analítica.** Es el único punto del sistema que está entregado y devuelve un
error.

El motivo es concreto y está identificado: al reforzar la seguridad de la base de datos en
mayo, una misma actualización hizo dos cosas incompatibles entre sí. El informe automático no
tiene permiso para leer los datos que él mismo genera.

**La corrección es de una línea.** Se ha reproducido el fallo y se ha verificado la causa
exacta. No hay que rehacer nada: hay que cambiar una opción de configuración de la base de
datos y añadir una prueba que impida que vuelva a pasar.

Con esa misma corrección, los informes seguirán mostrando datos antiguos hasta que se
programe su actualización automática, que es otro cambio de una línea.

---

## ¿Qué mejoras se recomiendan?

**Primero (imprescindible antes de dar el sistema por entregado):**

1. Arreglar la pantalla de Analítica y programar la actualización de sus datos.
2. Hacer que las alertas aparezcan solas, sin recargar.
3. Hacer que los pedidos por QR despierten todas las pantallas de cocina.
4. Avisar de stock bajo también cuando el stock baja al entregar pedidos, no solo cuando se
   saca material a mano.

**Después (para completar el producto):**

5. Poder editar y eliminar recetas.
6. Pantalla de conteo físico de inventario.
7. Subida de fotos de platos.
8. Completar el borrado de datos personales.
9. Añadir al informe los filtros por área y por responsable que se prometieron.

**Más adelante (mejoras de operación):**

10. Que el personal pueda seguir trabajando sin conexión.
11. Exportar los informes a Excel.
12. Aligerar las pantallas de bodega, que hoy son pesadas para una tableta.

---

## Valoración de conjunto

**El sistema está construido con un nivel de rigor superior al habitual.**

Dos datos que lo respaldan y que no son opinión:

- Las reglas de negocio críticas —incluida la regla de que nada sale sin receta— **están
  grabadas en la base de datos**, no solo en el programa. Eso significa que ni un error de
  programación futuro ni alguien con acceso técnico pueden saltárselas.
- Existen 12 pruebas automáticas que se ejecutan contra una base de datos real para verificar,
  cada vez que se cambia algo, que las reglas de seguridad siguen en pie. **Las 12 pasan.**

Los problemas encontrados no son de diseño ni de arquitectura: son piezas concretas que
quedaron sin conectar. La más grave —la pantalla de informes— se corrige con un cambio muy
pequeño.

**Estado global estimado: alrededor del 80 %.** El detalle de cómo se calculó ese número está
en el informe técnico, en `docs/PROJECT_STATUS.md`, sección 12.
