# WORKFLOW — Servicios

Prefijo: SERVICES
Alcance MVP: peluqueria

## Para qué sirve y para quién
El catálogo de lo que vende una peluquería o un centro de estética cuando lo que se vende no es un
artículo: cada servicio con su nombre, su precio, su duración, su categoría y su categoría fiscal
(el IVA con el que se cobra). De este catálogo leen la **Agenda** de Citas (qué se reserva y cuánto
dura), **Personal** (qué hace cada profesional), la respuesta automática de **WhatsApp** y el **TPV**
de Ventas (qué se cobra). También guarda los **bonos**: un bono es un paquete de sesiones de
servicios concretos que una clienta compra una vez y gasta en varias visitas; al cobrar, una sesión
del bono paga la línea del servicio entera. Lo usan el **empleado** (da de alta servicios, ve
bonos y saldos y gasta sesiones en el cobro), el **cajero** (ve el catálogo, gasta sesiones y puede conceder bonos), el
**responsable** (además edita servicios, categorías y bonos, anula o ajusta un bono vendido y
devuelve sesiones) y el **administrador** (además archiva servicios, borra categorías y bonos y
cambia los ajustes). Solo lo usa el vertical de peluquería: la plantilla de restaurante no siembra
servicios y ningún flujo de restaurante depende de él.

## Referencia adoptada
- **Salón / peluquería**: el estándar Fresha / Vagaro / Mangomint / DaySmart ya contrastado en la
  regla 4 de `.claude/qa/qa-method-shared.md` (servicio por profesional → checkout + pago →
  ficha de la clienta), y Square Appointments como en Citas. Se adopta: un servicio = nombre,
  precio, duración y categoría; archivar en vez de borrar, con aviso de las citas que lo usan; un
  servicio de precio no cerrado se cobra preguntando el importe.
- **Bonos**: la comparativa de mercado de los PR de `services#70`, `services#73` y `services#82`
  (Mindbody, Vagaro, Boulevard, Fresha), recogida en el código y en `architecture/modules/services.md`.
  Se adopta: el bono se paga al venderlo y el canje no emite documento fiscal; un bono cubre una
  línea de servicio entera, no un importe (no es una tarjeta regalo); el cobro enseña qué bono se
  gasta, cuántas sesiones quedan después y por qué ese; el canje se deshace hasta cobrar; devolver la
  venta devuelve la sesión aunque el bono haya caducado; la titularidad es de una sola clienta.
- Decisiones registradas que mandan aquí: ADR-0386 (un bono cubre líneas; una tarjeta regalo,
  importes), ADR-0390 (la titularidad del bono es una fila que nace al venderlo, el reloj arranca en
  la compra y no se transfiere), ADR-0085 (el IVA se enlaza por categoría fiscal de Impuestos).

## Antes de empezar
1. Servicios instala **Impuestos** con él. En **Impuestos → Categorías** tiene que haber al menos una
   categoría fiscal activa (TAXES-F01): sin ella el formulario de servicio avisa «Todavía no hay
   categorías fiscales. Configúralas en Impuestos antes de añadir servicios.» y no deja crear.
2. El hub enseña en «Termina de configurar tu negocio» el paso «Tu catálogo de servicios» («Añade los
   servicios que vendes, con su precio y su duración.»), con **Configurar**, que lleva a la pestaña
   Servicios. Se da por hecho en cuanto hay un servicio en oferta, tenga o no categoría fiscal.
3. Crea las categorías que quieras para agrupar el catálogo (SERVICES-F07) y da de alta los
   servicios (SERVICES-F01). La plantilla de peluquería ya trae categorías y servicios.
4. Para cobrar con bono hacen falta **Ventas** (el cobro) y **Clientes** (la titular del bono).
   Crea los bonos en **Bonos y paquetes** (SERVICES-F12) poniendo siempre **Usos**: vacío significa
   sesiones ilimitadas.
5. Los **Ajustes** de Servicios no cambian nada de lo que se hace en pantalla (SERVICES-F11).

## Pantallas

### Servicios
Menú → **Servicios** → pestaña **Servicios**. Tabla con Nombre, Categoría, Tarifa (Precio fijo, Por
hora, Desde, Variable, Gratis), Precio, Duración (min) y Estado: **Activo**, **Sin configurar** (con
el motivo debajo, «Sin categoría fiscal: no se puede cobrar») o **Archivado**. Buscador «Buscar
servicio…», filtros por columna (el filtro de Estado en **Archivado** cambia a la vista de
archivados), vista de lista o de tarjetas. El botón **Nuevo servicio** abre el panel lateral con
Nombre, Precio, Duración (min), Categoría («Sin categoría» o una de la lista) y Categoría fiscal
(sin opción vacía) y el botón **Crear servicio** (al editar, el panel se titula «Editando servicio —
<nombre>» y el botón es **Guardar cambios**). Por fila: **Editar** y **Archivar**; en la vista de archivados, **Restaurar**. Tocar una
fila abre Editar. **Archivar** abre «Archivar servicio» con «<nombre> — dejará de ofrecerse y de
poder reservarse. Se conservan su histórico y las citas ya reservadas.», el aviso «{count} cita(s)
próxima(s) siguen usando este servicio…» si Citas está instalada, y **Archivar** / **Cancelar**.
Vacía: «Sin servicios.» · Cargando: «Cargando…» · Error de carga: aviso en la tabla con reintento ·
Rechazo al guardar: dentro del panel («No se pudo crear el servicio», «No se pudo actualizar el
servicio» o el motivo concreto) · Rechazo de una acción de fila: arriba de la tabla («No se pudo
archivar el servicio», «No se pudo restaurar el servicio»).

### Categorías
Menú → **Servicios** → pestaña **Categorías**. Tabla con Nombre, Categoría padre, Orden y Servicios
(cuántos servicios en oferta tiene). Buscador «Buscar categoría…». **Nueva categoría** (solo con
permiso) abre el panel con Nombre, Categoría padre («Sin padre (raíz)» o otra) y Orden, y **Crear
categoría** / **Guardar cambios**. Por fila: **Editar** y **Eliminar**. **Eliminar** abre «Eliminar
categoría» con «<nombre> — la categoría desaparece; los servicios que contiene se conservan, sin
categoría.» y, si tiene servicios, «{count} servicio(s) se quedarán sin categoría.». Vacía: «No hay
categorías.» · Cargando: «Cargando…» · Un nombre repetido sale debajo del campo Nombre («Ya hay una
categoría con ese nombre. Elige otro nombre.»); otros rechazos, en el panel («No se pudo guardar la
categoría») o arriba de la tabla («No se pudo eliminar la categoría»).

### Bonos y paquetes
Menú → **Servicios** → pestaña **Bonos y paquetes**. Arriba, **Bonos sin cliente** (solo
responsable y administrador). Tabla con Nombre, Descuento, Precio cerrado, Líneas y Estado (Activo o
Archivado). Buscador «Buscar paquete…». **Nuevo paquete** abre el panel con Nombre, Tipo de
descuento (Porcentaje o Importe fijo), Descuento (%) o Descuento (importe), Precio cerrado («Déjalo
vacío para que valga la suma de sus líneas menos el descuento.»), Vigencia (días) («Días canjeable
desde la COMPRA; vacío = no caduca.»), Usos («Usos que concede el bono; vacío = ilimitados.») y
«Servicios incluidos»: una fila por servicio con Servicio y Sesiones, «Quitar línea» y **Añadir
servicio**; botón **Crear paquete**. Al editar, en lugar de las líneas sale «Los servicios incluidos
no se cambian una vez creado: archiva este paquete y crea uno nuevo.». Por fila: **Editar**,
**Movimientos**, **Bonos vendidos** y **Eliminar** (con «Eliminar paquete»: «<nombre> — el paquete y
sus {count} línea(s) desaparecen del catálogo; los bonos ya vendidos conservan su saldo.»).
Vacía: «No hay paquetes.» · Cargando: «Cargando…» · Rechazos en el panel («No se pudo guardar el
paquete», «Añade al menos un servicio: un paquete sin líneas no se puede canjear.») o arriba («No se
pudo eliminar el paquete»).

Hojas que se abren encima, todas con **Cerrar**, «Cargando…» mientras llegan, su vacío y su error
encima de lo ya cargado, y **Cargar más** con «Se muestran {shown} de {total}» («{shown} de {total}»
en Bonos sin cliente) cuando hay más:
- **Movimientos del bono**: cada sesión de ese bono, de todas las clientas, la más reciente primero,
  con una etiqueta (**Reservada**, **Entregada**, **Liberada**, **Caducada**, **Devuelta**,
  **Cortesía**, **Corrección**), el servicio, la fecha, «Cliente: <nombre>» y «Venta: <identificador
  de la venta>». Vacía: «Este bono aún no se ha usado.» · Error: «No se han podido cargar los
  movimientos».
- **Bonos vendidos**: una fila por compra, con **Activo** o **Anulado**, la clienta, la fecha, el
  importe, «{used} usadas · quedan {remaining}» (o «· sin límite»), la venta, «Caduca el …» o «No
  caduca» y lo regalado o corregido después; en una fila anulada, «Anulado por {who} el {when}» y el
  motivo. Botones **Ajustar** y **Anular** cuando proceden. Vacía: «Nadie ha comprado este bono
  todavía.» · Error: «No se han podido cargar los bonos vendidos».
- **Bonos sin cliente**: los bonos cuya ficha se eliminó o se anonimizó, con «Quedan {remaining}
  sesión(es)» o «Agotado» (un bono ilimitado sale como «Quedan 0 sesión(es)»), el importe, «Cliente
  borrado el {when}», «Caducado» si lo está y «Referencia del cliente: <identificador>». Vacía: «Ningún bono se ha quedado sin cliente.» ·
  Error: «No se han podido cargar los bonos sin cliente.».

### Ajustes de Servicios
Menú → **Servicios** → pestaña **Ajustes**, que el hub añade sola porque el módulo declara sus
ajustes. Título «Servicios». Campos: «Duración por defecto (min)», «Tiempo de margen por defecto
(min)», «Tipo de IVA por defecto» (texto libre), «Mostrar precios», «Mostrar duración», «Permitir
reserva online», «Precios con IVA incluido» y «Moneda»; botón **Guardar**. La ve todo el que entra
en Servicios; quien no es administrador la ve en solo lectura con «Solo un administrador puede
cambiar estos ajustes.». Cargando: «Cargando ajustes…» · Error: «No se pudieron cargar los
ajustes.» o «No se pudieron guardar los ajustes.» · Guardado: «Ajustes guardados.».

### Hueco del bono en el cobro
Lo pinta Servicios dentro de la hoja **Cobro** de Ventas, en «Líneas pagadas de otra forma», una vez
por línea de servicio, cuando hay clienta y cuenta abierta (SALES-F27). Muestra «Pagar esta línea
con un bono», «{count} bonos válidos» si hay más de uno, y una tarjeta por bono con su nombre,
«Quedan {before} sesiones · {after} después de esta» (o «Sesiones ilimitadas»), «Caduca el {date}» y,
en el que se gastará, el porqué («Se gasta primero porque es el que antes caduca.», etc.). Botón
**Gastar una sesión** («Reservando…»). Hecho: «{name}: sesión gastada. Quedan {after}.» con
**Deshacer**; si la pantalla se recarga o se vuelve a una cuenta aparcada, el hueco vuelve a
enseñarlo así, pero el TPV ya no da la línea por cubierta (SERVICES-F22). Sin bonos: «Este cliente no tiene ningún bono que cubra este servicio.» · Cargando: un
bloque gris animado · Error: «No se han podido cargar los bonos del cliente. Inténtalo otra vez antes
de cobrar el precio completo.» con **Reintentar**.

### Hueco del bono en la devolución
Lo pinta Servicios dentro de la ventana **Devolver** de Ventas, en cada línea que pagó un bono
(SALES-F32). Muestra la casilla «Devolver la sesión a {name}», marcada de entrada, con «Quedan
{before} sesiones · {after} tras esta devolución»; si el bono ya caducó, «{name} caducó el {date}. La
sesión vuelve al bono igualmente.». Una sesión que no puede volver enseña su motivo («Esta sesión ya
se devolvió en otra devolución.», «Esta sesión nunca se cobró, así que no hay nada que devolver.»).
Hecho: «{name}: la sesión ha vuelto al bono.» · Cargando: un bloque gris animado · Error: «No se han
podido leer las sesiones de bono de esta venta. Inténtalo otra vez antes de terminar la devolución.»
con **Reintentar**; si falla al devolver: «No se ha podido devolver esa sesión al bono.».

## Flujos

El detalle de cada flujo (pasos, datos, fallos, implicados y QA) está en `workflow/`, con la misma
gramática y el mismo prefijo. Antes de tocar código, lee el fichero del flujo que cambias.

| ID | Flujo | Estado | Detalle |
|---|---|---|---|
| SERVICES-F01 | Dar de alta un servicio | hecho | [`workflow/catalogo.md`](workflow/catalogo.md) |
| SERVICES-F02 | Editar un servicio | parcial | [`workflow/catalogo.md`](workflow/catalogo.md) |
| SERVICES-F03 | Poner un servicio a precio abierto | parcial | [`workflow/catalogo.md`](workflow/catalogo.md) |
| SERVICES-F04 | Archivar un servicio | hecho | [`workflow/catalogo.md`](workflow/catalogo.md) |
| SERVICES-F05 | Ver y restaurar los servicios archivados | parcial | [`workflow/catalogo.md`](workflow/catalogo.md) |
| SERVICES-F06 | Dar de alta muchos servicios de golpe | parcial | [`workflow/catalogo.md`](workflow/catalogo.md) |
| SERVICES-F07 | Crear y editar categorías | parcial | [`workflow/catalogo.md`](workflow/catalogo.md) |
| SERVICES-F08 | Eliminar una categoría | parcial | [`workflow/catalogo.md`](workflow/catalogo.md) |
| SERVICES-F09 | Vender un servicio en el TPV | parcial | [`workflow/catalogo.md`](workflow/catalogo.md) |
| SERVICES-F10 | Entregar el catálogo a Citas, Personal, WhatsApp y Combos | hecho | [`workflow/catalogo.md`](workflow/catalogo.md) |
| SERVICES-F11 | Cambiar los ajustes de Servicios | parcial | [`workflow/catalogo.md`](workflow/catalogo.md) |
| SERVICES-F12 | Crear un bono | parcial | [`workflow/bonos.md`](workflow/bonos.md) |
| SERVICES-F13 | Editar o eliminar un bono | parcial | [`workflow/bonos.md`](workflow/bonos.md) |
| SERVICES-F14 | Vender un bono a una clienta | parcial | [`workflow/bonos.md`](workflow/bonos.md) |
| SERVICES-F15 | Consultar los bonos de una clienta | parcial | [`workflow/bonos.md`](workflow/bonos.md) |
| SERVICES-F16 | Ver quién ha comprado un bono | hecho | [`workflow/bonos.md`](workflow/bonos.md) |
| SERVICES-F17 | Anular un bono vendido por error | hecho | [`workflow/bonos.md`](workflow/bonos.md) |
| SERVICES-F18 | Regalar sesiones, alargar la caducidad o corregir el saldo | hecho | [`workflow/bonos.md`](workflow/bonos.md) |
| SERVICES-F19 | Ver los movimientos de un bono | hecho | [`workflow/bonos.md`](workflow/bonos.md) |
| SERVICES-F20 | Un bono caduca | hecho | [`workflow/bonos.md`](workflow/bonos.md) |
| SERVICES-F21 | Gastar una sesión fuera del cobro | parcial | [`workflow/bonos.md`](workflow/bonos.md) |
| SERVICES-F22 | Pagar una línea con un bono | parcial | [`workflow/cobro-y-devolucion.md`](workflow/cobro-y-devolucion.md) |
| SERVICES-F23 | Soltar la sesión si la línea o la cuenta desaparecen | parcial | [`workflow/cobro-y-devolucion.md`](workflow/cobro-y-devolucion.md) |
| SERVICES-F24 | Dar por gastadas las sesiones al cobrar | parcial | [`workflow/cobro-y-devolucion.md`](workflow/cobro-y-devolucion.md) |
| SERVICES-F25 | La sesión retenida que nadie cobra vuelve sola | hecho | [`workflow/cobro-y-devolucion.md`](workflow/cobro-y-devolucion.md) |
| SERVICES-F26 | Devolver la sesión al devolver la venta | parcial | [`workflow/cobro-y-devolucion.md`](workflow/cobro-y-devolucion.md) |
| SERVICES-F27 | Devolver la sesión al anular la venta | no hecho | [`workflow/cobro-y-devolucion.md`](workflow/cobro-y-devolucion.md) |
| SERVICES-F28 | Unir dos fichas: los bonos pasan a la que queda | hecho | [`workflow/fichas-de-clienta.md`](workflow/fichas-de-clienta.md) |
| SERVICES-F29 | Eliminar o anonimizar una ficha: sus bonos quedan sin cliente | hecho | [`workflow/fichas-de-clienta.md`](workflow/fichas-de-clienta.md) |
| SERVICES-F30 | Rescatar los bonos sin cliente | parcial | [`workflow/fichas-de-clienta.md`](workflow/fichas-de-clienta.md) |

## Cobertura contra la referencia

| Elemento (catálogo de salón: Fresha, Vagaro, Mangomint, Square Appointments) | Estado | Flujo |
|---|---|---|
| Servicio con nombre, precio, duración, categoría y categoría fiscal | hecho | SERVICES-F01, SERVICES-F02 |
| Archivar con aviso de citas futuras, y restaurar | hecho | SERVICES-F04, SERVICES-F05 |
| Categorías con nombre único | hecho | SERVICES-F07 |
| Orden de las categorías y jerarquía visibles al vender | no hecho — «Orden» y «Categoría padre» se guardan pero el TPV las enseña planas y por nombre | SERVICES-F07 |
| Precio variable o «desde» que se pregunta al cobrar | parcial — la tarifa solo se pone por el asistente o la API; el TPV sí pregunta (Ventas) | SERVICES-F03 |
| Importar la lista de servicios | parcial — solo por el asistente o la API, sin importador en pantalla | SERVICES-F06 |
| Tiempo de margen antes o después del servicio | no hecho — se guarda (asistente o API) y la agenda no lo usa | — |
| Servicio reservable o no, y reserva online por servicio | no hecho — siempre reservable desde la pantalla; la reserva online está fuera del MVP | — |
| Precio y duración propios por profesional | hecho en Personal (STAFF-F10) | SERVICES-F10 |
| Variantes y extras con precio | fuera de este módulo — es Suplementos (`modifiers`, ADR-0376) | — |
| Capacidad (varias clientas a la vez) | fuera del MVP | — |

| Elemento (bonos: Mindbody, Vagaro, Boulevard, Fresha) | Estado | Flujo |
|---|---|---|
| Bono de N sesiones de servicios concretos | parcial — el límite es «Usos» para el bono entero; las «Sesiones» de cada servicio no limitan nada | SERVICES-F12 |
| Vender el bono a una clienta en el TPV | parcial — el TPV no ofrece bonos; solo por el asistente o la API, con la línea marcada como servicio | SERVICES-F14 |
| Caducidad que cuenta desde la compra | hecho | SERVICES-F20 |
| Gastar en el cobro con vista previa del saldo y del bono elegido | parcial — tras recargar o volver a una cuenta aparcada, el TPV cobra la línea y además se gasta la sesión; dividir la cuenta o cobrar solo una parte gasta sesiones de líneas que no se cobran | SERVICES-F22, SERVICES-F24 |
| Deshacer el canje antes de cobrar | hecho | SERVICES-F22, SERVICES-F23 |
| Saldo de bonos visible en la ficha de la clienta | parcial — solo en el cobro, servicio a servicio, y por el asistente | SERVICES-F15 |
| La sesión vuelve al devolver la venta | parcial — no si la venta mezcló bono y dinero y ya se devolvió todo el dinero (sales#512) | SERVICES-F26 |
| La sesión vuelve al anular la venta | no hecho | SERVICES-F27 |
| Anular la venta de un bono hecha por error | hecho | SERVICES-F17 |
| Regalar sesiones, alargar la caducidad, corregir el saldo | hecho | SERVICES-F18 |
| Historial de movimientos del bono | hecho | SERVICES-F19 |
| Bonos de una ficha unida, eliminada o anonimizada | hecho | SERVICES-F28, SERVICES-F29 |
| Pasar un bono a otra clienta o compartirlo | fuera del MVP — services#79, services#80; ADR-0390 | SERVICES-F30 |
| Tarjeta regalo (saldo en euros) | fuera — otra familia (ADR-0386) | — |

## Datos: de quién es cada dato

| Dato | Dueño | Cómo lo obtiene o lo entrega Servicios |
|---|---|---|
| Servicio (nombre, precio, tarifa, duración, márgenes, categoría, categoría fiscal) | Servicios | propio; lo leen Citas, Personal, WhatsApp, Combos y el TPV por sus lecturas públicas |
| Categoría de servicio | Servicios | propio |
| Bono del catálogo y sus líneas | Servicios | propio |
| Bono vendido (titular, fecha, importe, sesiones y vigencia congeladas) | Servicios | propio; nace al cobrar un tique con la línea del bono o por concesión manual |
| Sesiones retenidas, gastadas, soltadas, caducadas y devueltas | Servicios | propio |
| Cortesías y correcciones de un bono vendido | Servicios | propio |
| Ajustes de Servicios | Servicios | propio |
| Categoría fiscal y su tipo | Impuestos | la lista de categorías para elegir; Servicios guarda solo la clave y no comprueba que exista al guardar |
| Clienta | Clientes | solo su identificador en el bono; el nombre se pide a Clientes al pintar las hojas, si está instalado y hay permiso |
| Venta, cuenta, línea y documento de devolución | Ventas | solo sus identificadores, que llegan en los avisos de Ventas y en los huecos del cobro y la devolución |
| Citas futuras de un servicio | Citas | lectura opcional al archivar; Servicios no la guarda |
| Quién puede hacer cada servicio | Personal | Servicios no lo guarda ni lo decide |
| Nombres del equipo | Hub | lista de usuarios del hub para «Anulado por», «Regalado por», «Corregido por» y «Devuelta por» |

**Datos personales (inventario RGPD, recorriendo las migraciones):**
- **Bono vendido:** el identificador de la clienta (sin nombre ni contacto), la fecha de compra y
  el importe pagado (total, base e IVA), que juntos son su historial de compras de bonos, la venta y
  su referencia, una nota libre (en la venta del TPV, el nombre del bono; en la concesión manual,
  hasta 500 caracteres de texto libre), el motivo libre de una anulación y quién la hizo, y la fecha
  en que se eliminó la ficha.
- **Sesiones:** el identificador de la clienta, la cita y la venta enlazadas, una nota libre, quién
  devolvió la sesión, el documento de devolución y su nota libre.
- **Cortesías y correcciones:** el motivo libre y quién las hizo.
- **Servicio:** descripción y notas libres (datos del negocio, no de clientas).
- **Auditoría** en todas las tablas: quién creó y quién cambió cada fila (usuarios del hub).
- **Tablas retiradas que siguen en la base de datos con otro nombre:** las de variantes y extras
  (migraciones 009 y 010), apartadas con el prefijo `_deprecated_`; solo datos de catálogo y
  auditoría.
- **Lo que sale hacia otros:** los avisos de bono vendido, sesión retenida, gastada, soltada,
  devuelta, bono anulado y bono ajustado viajan con lo que pidió la orden: identificador de la
  clienta, notas y motivos libres incluidos.
- **Borrado:** al eliminar o anonimizar la ficha, Servicios solo sella sus bonos como «sin cliente»
  (SERVICES-F29): el identificador se queda (es la única forma de casar el bono con la venta que lo
  pagó) y las notas y motivos libres no se vacían aunque nombren a la clienta (hueco de la familia
  RGPD).

## Reglas que no se rompen
- **Sin categoría fiscal no hay servicio:** el alta, la edición y cada línea del alta por lote
  exigen la categoría; la pantalla no ofrece la opción vacía. (Una clave hecha solo de espacios,
  por el asistente o la API, pasa en el alta suelta y el servicio sale **Sin configurar**.)
- **Dinero en la unidad mínima de la moneda, entero y nunca negativo:** precio, coste, precio
  cerrado y descuento fijo: el servidor rechaza lo que no sea un número entero no negativo. (Que un
  importe ilegible o ambiguo se rechace con su motivo, y no como 0, lo hace la pantalla.)
- **Aislamiento por hub:** la categoría de un servicio, la categoría padre y los servicios de un
  bono tienen que ser de este negocio (el alta por lote no lo comprueba para la categoría,
  SERVICES-F06); una lectura nunca cruza de negocio.
- **Un nombre de categoría por negocio** (sin distinguir mayúsculas ni espacios).
- **Solo se gasta un bono comprado** (sin compra no hay nada que gastar), en el cobro solo en los
  servicios que incluye, y nunca agotado, caducado, anulado ni con su bono del catálogo eliminado o
  desactivado.
- **Una línea, una sesión:** la misma línea de la misma cuenta no se cubre dos veces.
- **Dos cajas sobre el mismo bono van en fila**, y la que llega tarde recibe el motivo real.
- **Lo cobrado no se deshace:** una sesión de una venta cobrada no se suelta; solo vuelve por una
  devolución, y una sola vez: el mismo documento repetido no devuelve otra, y otro documento sobre la
  misma sesión se rechaza («Esa sesión del bono ya se devolvió en otra devolución.»).
- **Las condiciones vendidas se congelan:** cambiar «Usos» o «Vigencia (días)» del catálogo no toca
  los bonos ya vendidos; regalar o corregir es un movimiento aparte con motivo, de hasta 100
  sesiones (sumar o quitar) y hasta 366 días (solo alargar), y nunca quita más sesiones de las que
  le quedan a la clienta.
- **Anular solo un bono intacto**, con motivo.
- **Ningún movimiento de bono mueve dinero ni emite documento fiscal**: el registro fiscal sale con
  la venta del bono.
- **Permisos:** empleado ve todo salvo **Bonos sin cliente**, da de alta servicios y gasta sesiones; cajero ve, gasta sesiones
  y concede bonos;
  responsable además edita servicios, categorías y bonos, anula y ajusta bonos vendidos, devuelve
  sesiones y ve los bonos sin cliente; administrador además archiva servicios, borra categorías y
  bonos y cambia los ajustes. El servidor vuelve a comprobar el permiso en cada orden.

## Lo que NO hace, a propósito
- No reserva (Citas), no cobra ni imprime (Ventas), no calcula el IVA (Impuestos) y no decide qué
  profesional hace un servicio (Personal; que un servicio sin nadie asignado lo pueda hacer todo el
  equipo lo decide Citas).
- No tiene variantes ni extras: se retiraron (migraciones 009 y 010); la opción con precio es un
  suplemento de Suplementos.
- No pasa un bono de una clienta a otra ni lo comparte (ADR-0390; services#79, services#80).
- No es una tarjeta regalo: un bono paga una línea de servicio entera, no una cantidad de dinero.
- No avisa a la clienta de que su bono va a caducar ni de cuántas sesiones le quedan.

## Dudas abiertas
- ¿Las «Sesiones» de cada servicio de un bono deben limitar cuántas veces se gasta en ese servicio,
  o el bono es una bolsa de «Usos» que vale para cualquiera de sus servicios? Hoy es lo segundo y el
  formulario pide las dos cosas.
- ¿Cómo se vende un bono en el TPV: como baldosa propia, a su precio cerrado o con su descuento? Hoy
  el TPV no lo ofrece y «Descuento» y «Precio cerrado» no se usan en ningún cobro.
- ¿Eliminar o desactivar un bono del catálogo debe dejar de servir los ya vendidos? Hoy deja de
  servirlos y el aviso de borrado dice lo contrario.
- ¿Anular una venta debe devolver sola la sesión del bono, como la devolución? (La misma duda está
  en el WORKFLOW de Ventas.)
- ¿Se ocultan los ajustes que no cambian nada o se hacen efectivos desde la pantalla?
- ¿El paso «Tu catálogo de servicios» debe exigir un servicio con categoría fiscal?

## Fuentes contrastadas
Contra el código de `origin/main` (v1.5.71), una línea por discrepancia:
- `docs/screens.md` («Create a service»): describe tarifa, precio mínimo y máximo, márgenes, capacidad, reservable, confirmación, reserva online, SKU, código de barras, imagen y destacado en el alta; la pantalla solo pide Nombre, Precio, Duración (min), Categoría y Categoría fiscal (SERVICES-F01, SERVICES-F03).
- `docs/screens.md` (ajustes): «Default tax category — the category used by services that do not set one», «Show prices, show duration — what the public-facing surfaces display», «Online booking», «Tax included»; nada lee la categoría por defecto, mostrar precios, mostrar duración, IVA incluido ni la moneda, y la duración, el margen y la reserva online por defecto solo cuentan en altas por el asistente o la API (SERVICES-F11).
- `docs/screens.md` y la frase de `locales/es.json` del aviso de borrado de bono: «vouchers already sold keep their balance» / «los bonos ya vendidos conservan su saldo»; el saldo se conserva pero ya no se puede gastar en el cobro ni se ve en «Bonos vendidos» (SERVICES-F13).
- `docs/screens.md` («A voucher that was already used cannot be voided; correcting its balance (services#119) is a separate door that does not exist yet»): la corrección ya existe con **Ajustar** (SERVICES-F18).
- `docs/screens.md` y `hand-book/modulos/services.md` («the voucher goes on the ticket like any other line», «En el TPV… añadir el bono al ticket»): el TPV no ofrece bonos; venderlo solo se puede por el asistente o la API (SERVICES-F14).
- `docs/screens.md` («done once there is at least one sellable service»): el paso de arranque cuenta también los servicios sin categoría fiscal, que no se pueden cobrar.
- `docs/screens.md` («a cashier who cannot refund never sees the hole»): el hub no filtra los huecos por el permiso que declara el módulo; con los perfiles de fábrica no se nota porque **Devolver** solo lo abren responsable y administrador.
- `docs/limits.md` («Deleting a customer leaves their grants behind… no balance screen will show»): desactualizado; se sellan y salen en **Bonos sin cliente** (SERVICES-F29, SERVICES-F30).
- `docs/limits.md` («The relay delivers `sale.completed` with the permissions of whoever completed the sale»): el hub ejecuta los oyentes con la autoridad del módulo, no con el perfil de quien cobró.
- `docs/limits.md`, `docs/overview.md`, `docs/concepts.md` y `architecture/modules/services.md` dicen que el hub valida la categoría fiscal contra Impuestos al guardar; el alta y la edición solo exigen que no esté vacía (lo mismo dice TAXES-F19).
- `docs/concepts.md` («Leave it empty and the service falls back to the hub's default tax category») y `architecture/modules/services.md` (categoría por defecto «para servicios sin categoría propia»): un servicio no se puede guardar sin categoría y nada lee la de los ajustes.
- `docs/concepts.md` («Deleting one cascades to its descendants»): eliminar una categoría no toca sus subcategorías, que siguen vivas con un padre eliminado (SERVICES-F08).
- `docs/concepts.md` («deleting a package does not currently cascade the soft-delete to its lines») y («Variants and add-ons exist in the data»): desactualizados; las líneas se borran con el bono y las variantes y extras se retiraron.
- `docs/overview.md` («the clock runs from the customer's first live use, so returning the use that started it un-starts it»): la caducidad cuenta desde la compra (ADR-0390) y devolver una sesión no la mueve (SERVICES-F20).
- `schemas/package_create.json` y `schemas/package_update.json` (`validity_days`: «after its first use»): la vigencia cuenta desde la compra, que es lo que lee el asistente al crear o editar un bono (SERVICES-F20).
- `docs/overview.md` (eventos que escucha): solo nombra la venta cobrada; también escucha quitar una línea y anular una cuenta de Ventas, y eliminar, anonimizar y unir fichas de Clientes.
- `hand-book/modulos/services.md`: llama «Paquetes» a la pestaña «Bonos y paquetes»; dice que los ajustes están «en los ajustes del Hub» (es la pestaña Ajustes del módulo); pide activar «Reservable» y «Reserva online» y elegir tipo de precio, márgenes y capacidad, que no están en la pantalla; y pide comprobar «el saldo del cliente», que no tiene pantalla (SERVICES-F15).
- `locales/es.json` (`ui.packageLinesFixed`): «archiva este paquete y crea uno nuevo»; no hay archivar para bonos, solo **Eliminar**, y uno nuevo con el mismo nombre se rechaza (SERVICES-F12, SERVICES-F13).
- `locales/es.json` (`ui.orphansHint`): «devuélvelo o pásalo a otra ficha»; la hoja no tiene ninguna acción y pasar un bono a otra ficha no existe (SERVICES-F30).
- `locales/es.json` (`settings.fields.default_tax_category_key`): se llama «Tipo de IVA por defecto» pero guarda una clave de categoría escrita a mano y no se usa (SERVICES-F11).
- B-08 (`qa-hub.md` §6) y BD-05 (`qa-business-day.md`) esperan crear y vender bonos desde la pantalla; se crean, pero venderlos no tiene pantalla (SERVICES-F14).
