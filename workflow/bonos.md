# WORKFLOW — Servicios · Bonos: catálogo, venta y gestión

Prefijo: SERVICES

## Flujos

### SERVICES-F12 Crear un bono
Estado: parcial — las «Sesiones» de cada servicio no limitan nada: el único tope es «Usos», para el bono entero y para cualquiera de sus servicios, y con «Usos» vacío el bono es ilimitado; «Descuento» y «Precio cerrado» se guardan y se ven en la tabla, pero ningún cobro los usa; un nombre que ya tuvo otro bono, también uno eliminado, no se puede volver a usar
Actor: responsable
Pantalla: Bonos y paquetes
Pasos:
1. En **Bonos y paquetes** pulsa **Nuevo paquete**.
2. Escribe el Nombre (por ejemplo, «Bono 5 cortes»). Elige el Tipo de descuento y su valor, y si
   quieres un Precio cerrado.
3. Pon la Vigencia (días), que cuenta desde la compra (vacía = no caduca), y los **Usos**: el número
   de sesiones que da el bono en total (vacío = ilimitadas).
4. En «Servicios incluidos» elige cada Servicio (salen los que están en oferta, con su precio) y sus
   Sesiones; **Añadir servicio** añade otra fila y «Quitar línea» la quita.
5. Pulsa **Crear paquete**: el panel se cierra y el bono sale en la tabla como **Activo** con su
   número de líneas.
Entra: los servicios en oferta del catálogo.
Sale: el bono en el catálogo (`services.package.created`). Un servicio repetido en las líneas se
guarda una sola vez. Al gastarlo en el cobro, cualquier servicio de sus líneas consume uno de sus
«Usos», sea cual sea el número de sesiones que se escribió en esa línea.
Si falla: dentro del panel. Sin ningún servicio: «Añade al menos un servicio: un paquete sin líneas
no se puede canjear.». Un importe ilegible, ambiguo o negativo, con el nombre del campo delante
(«Precio cerrado: Esto no es un importe…»). Un nombre ya usado por otro bono, vivo o eliminado, se
rechaza sin decir que el nombre está repetido: sale «No se pudo guardar el paquete» o un aviso sin
frase propia (leído en el código, sin ejecutar).
Implicados: REC_PELUQUERIA-F04, REC_PELUQUERIA-F13
QA: BD-05, B-08

### SERVICES-F13 Editar o eliminar un bono
Estado: parcial — eliminar un bono del catálogo deja sus bonos vendidos sin poder gastarse en el cobro y sin poder abrir sus «Bonos vendidos» ni sus «Movimientos», aunque el aviso dice que «conservan su saldo»; el texto de edición manda «archivar» un bono y no hay archivar, solo **Eliminar**; un bono no se puede desactivar desde la pantalla
Actor: responsable, administrador
Pantalla: Bonos y paquetes
Pasos:
1. Toca la fila del bono o su **Editar** («Editando paquete — <nombre>»). Cambia Nombre, Descuento,
   Precio cerrado, Vigencia (días) o Usos; las líneas no se pueden cambiar («Los servicios incluidos
   no se cambian una vez creado: archiva este paquete y crea uno nuevo.»). Pulsa **Guardar cambios**.
2. Para quitarlo del catálogo (administrador), pulsa **Eliminar** en la fila y confirma en «Eliminar
   paquete».
Entra: el bono del catálogo.
Sale: al editar, el bono cambiado (`services.package.updated`); «Usos» y «Vigencia (días)» solo
valen para las ventas futuras: los bonos ya vendidos conservan lo que se vendió. El nombre nuevo se
ve también en los bonos ya vendidos. Al eliminar, el bono y sus líneas salen del catálogo
(`services.package.deleted`); sus bonos vendidos dejan de ofrecerse en el cobro, gastarlos se
rechaza con «Ese paquete no existe en este negocio.» y solo siguen visibles en **Bonos sin cliente**
(si su clienta se eliminó) y cuando se le pregunta al asistente por los bonos de la clienta
(SERVICES-F15).
Si falla: «No se pudo guardar el paquete» en el panel o «No se pudo eliminar el paquete» arriba. Si
el bono ya se eliminó en otro dispositivo, **Eliminar** vuelve a responder bien y no avisa de nada, y
**Guardar cambios** se rechaza con un texto técnico del validador («payload inválido para
`services.packages.update`: …»), no con «Ese paquete no existe en este negocio.» (leído en el código,
sin ejecutar).
Implicados: SALES-F27
QA: BD-05, B-08

### SERVICES-F14 Vender un bono a una clienta
Estado: parcial — no hay pantalla: el TPV no ofrece los bonos como artículo y no hay botón de venta manual; solo con el asistente o la API (cobrando un tique con la línea del bono marcada como servicio, o con la concesión manual); y devolver la venta del bono no lo anula
Actor: cajero, responsable, asistente
Pantalla: asistente
Pasos:
1. Con la clienta elegida, cobra un tique cuya línea es el bono del catálogo (por el asistente o la
   API: la línea lleva el id del bono como artículo y marcada como servicio, con el precio y el IVA
   que se manden; nadie los contrasta con «Precio cerrado» ni con «Descuento»). Al cobrarse, cada unidad de esa
   línea se convierte en un bono vendido a esa clienta, con su parte del importe y del IVA.
2. O pide al asistente que conceda el bono a la clienta (concesión manual), con la venta y el
   importe si los hay, para un bono entregado fuera del TPV.
3. El bono aparece en **Bonos vendidos** de ese bono (SERVICES-F16) y en el hueco del cobro de esa
   clienta (SERVICES-F22).
Entra: la venta cobrada con su clienta y sus líneas (Ventas) o la petición de concesión; el bono del catálogo, activo.
Sale: un bono vendido por unidad, con la titular, la fecha, la venta, el importe y los «Usos» y la
«Vigencia (días)» del catálogo congelados; la caducidad cuenta desde ese momento. La concesión manual
avisa (`services.package.granted`); la que nace de la venta cobrada, no. Repetir el aviso de la
venta no concede dos veces. Ningún documento fiscal sale aquí: lo emite la venta del bono.
Si falla: un tique sin clienta no concede nada y no se avisa en ninguna pantalla (la venta se cobra
igual): hay que concederlo a mano. La concesión manual se rechaza con «Elige el cliente al que
pertenece el bono: un bono sin dueño no lo puede canjear nadie.» o «Ese paquete no existe en este
negocio.» (también si el bono se eliminó). Si la línea del bono no va marcada como servicio, Ventas
rechaza la venta entera porque ese artículo no está en su catálogo. Un bono desactivado por la API:
la concesión manual se rechaza sin frase propia, y venderlo en un tique hace fallar entero el aviso de
la venta cobrada: no se concede, y las sesiones retenidas en ese tique no se dan por gastadas y vuelven
al bono al cabo de un día (SERVICES-F24) (leído en el código, sin ejecutar). Anular después la venta
del bono lo anula solo, con quien anuló la venta, la hora y su motivo, si no se ha gastado ni reservado
ninguna sesión suya; si ya se usó, sigue vivo y se corrige con **Ajustar** (SERVICES-F18). Devolver la
venta del bono no lo anula: hay que anularlo en **Bonos vendidos** si no se ha usado (SERVICES-F17).
Implicados: SALES-F01, SALES-F30, SALES-F31, REC_PELUQUERIA-F13
QA: B-08, BD-05 (discrepa)

### SERVICES-F15 Consultar los bonos de una clienta
Estado: parcial — no hay pantalla con todos los bonos de una clienta: ni Servicios ni la ficha de Clientes los enseñan; solo el hueco del cobro, servicio a servicio, y el asistente
Actor: empleado, cajero, responsable, asistente
Pantalla: asistente
Pasos:
1. Pregunta al asistente por los bonos de la clienta: responde una fila por compra, con el bono,
   cuándo se compró, lo pagado, las sesiones usadas y las que quedan, cuándo caduca y si ya caducó.
   También salen los de un bono eliminado del catálogo, que ya no se pueden gastar (SERVICES-F13).
2. En el cobro, el hueco de cada línea de servicio enseña los bonos de esa clienta que cubren ese
   servicio, con las sesiones que quedan y la caducidad (SERVICES-F22).
3. En **Bonos y paquetes → Bonos vendidos** se ve cada compra de un bono concreto (SERVICES-F16).
Entra: la clienta (Clientes) y sus bonos vendidos.
Sale: nada; solo lectura. Dos compras del mismo bono son dos filas, cada una con su saldo y su caducidad.
Si falla: el asistente dice que no pudo leerlo.
Implicados: SALES-F27
QA: B-08

### SERVICES-F16 Ver quién ha comprado un bono
Estado: hecho
Actor: empleado, cajero, responsable
Pantalla: Bonos y paquetes
Pasos:
1. En la fila del bono pulsa **Bonos vendidos**.
2. Sale una fila por compra, la más reciente primero: **Activo** o **Anulado**, «Cliente: <nombre>»,
   fecha, importe, «{used} usadas · quedan {remaining}» (o «· sin límite»), la venta, «Caduca el …»
   o «No caduca» y, si se regaló o corrigió algo después, «Regalado después: …» o «Corregido después:
   …». Una anulada dice «Anulado por {who} el {when}» y el motivo.
3. **Cargar más** trae la página siguiente. **Cerrar** vuelve a la tabla.
Entra: las compras de ese bono; el nombre de cada clienta, de Clientes (CUSTOMERS-F30); el del empleado, de la lista de usuarios del hub.
Sale: nada; solo lectura. **Ajustar** y **Anular** salen en las filas en que proceden y para quien tiene permiso (SERVICES-F17, SERVICES-F18).
Si falla: «No se han podido cargar los bonos vendidos». Mientras llega un nombre, «Cargando
nombre…»; sin Clientes, sin permiso para ver clientes o con la ficha eliminada, sale el identificador.
Implicados: CUSTOMERS-F30, REC_PELUQUERIA-F13
QA: B-08

### SERVICES-F17 Anular un bono vendido por error
Estado: hecho
Actor: responsable
Pantalla: Bonos y paquetes
Pasos:
1. En **Bonos vendidos**, en la compra equivocada (a otra clienta, otro bono, cobrado dos veces),
   pulsa **Anular**. Solo sale si no se ha gastado ni reservado ninguna sesión de ese bono.
2. Lee «¿Anular este bono?»: «El bono del cliente {customer} ({amount}) deja de poder usarse y queda
   en la lista como anulado. El dinero no se devuelve aquí: si se cobró, devuelve la venta desde
   Ventas con una devolución.».
3. Escribe el Motivo (obligatorio; el botón no se activa sin él) y pulsa **Anular** («Anulando…»), o
   **Cancelar**.
4. La lista se vuelve a leer y la fila sale **Anulado** con quién, cuándo y el motivo.
Entra: la compra y el motivo.
Sale: el bono deja de poder gastarse en todas partes y queda como rastro (`services.package.grant_voided`).
No mueve dinero ni emite documento: la devolución del dinero es una devolución en Ventas. Repetir el
aviso de la venta que lo concedió no lo vuelve a conceder.
Si falla: en la propia confirmación: «Ese bono ya se ha usado: no se puede anular.», «Ese bono ya
estaba anulado.», «Ese bono no se puede anular ahora: se ha usado o anulado mientras tanto. Recarga la
lista y vuelve a intentarlo.» o «No se ha podido anular el bono». Si otra caja está gastando una
sesión a la vez, la anulación espera y después se rechaza.
Implicados: SALES-F31, REC_PELUQUERIA-F13
QA: B-08

### SERVICES-F18 Regalar sesiones, alargar la caducidad o corregir el saldo
Estado: hecho
Actor: responsable
Pantalla: Bonos y paquetes
Pasos:
1. En **Bonos vendidos** pulsa **Ajustar** en una compra viva que tenga límite de sesiones o caducidad.
2. En «Ajustar este bono» elige **Añadir sesiones** o **Quitar sesiones** (solo si el bono tiene
   límite) y escribe cuántas («Sesiones que se añaden»: hasta 100; «Sesiones que se quitan»: hasta
   las que le quedan), y/o «Días que se alarga» (solo si caduca; hasta 366).
3. Escribe el Motivo (obligatorio) y revisa la vista previa: «Tras el ajuste: quedan {remaining}
   sesión(es) · caduca el {when}».
4. Pulsa **Ajustar**. La lista se vuelve a leer con «Regalado después: …» o «Corregido después: …».
Entra: la compra, las cantidades y el motivo.
Sale: un movimiento aparte con quién, cuándo, cuánto y por qué (`services.package.grant_adjusted`),
que sale en **Movimientos** como **Cortesía** o **Corrección**; la compra no se reescribe. Revive un
bono caducado o agotado. No mueve dinero ni emite documento. Un ajuste no se borra: se deshace con
otro de signo contrario.
Si falla: en el formulario: «Indica por qué se ajusta este bono: el motivo queda en su registro.»,
«Añade o quita al menos una sesión, o añade al menos un día.», «No puedes quitar más sesiones de las
que le quedan al cliente.», «Ese bono no tiene límite de sesiones…», «Ese bono no caduca…», «Ese bono
no se puede ajustar ahora: se ha anulado, o se han usado sus sesiones, mientras tanto. Recarga la
lista y vuelve a intentarlo.» o «No se pudo ajustar el bono». La caducidad no se puede adelantar.
Implicados: SALES-F32, REC_PELUQUERIA-F14
QA: B-08

### SERVICES-F19 Ver los movimientos de un bono
Estado: hecho
Actor: empleado, cajero, responsable
Pantalla: Bonos y paquetes
Pasos:
1. En la fila del bono pulsa **Movimientos**.
2. Sale cada movimiento de ese bono, de todas sus clientas, el más reciente primero: **Reservada**
   (en un cobro sin cerrar), **Entregada**, **Liberada** (deshecha antes de cobrar), **Caducada**
   (reservada y nunca cobrada), **Devuelta** (con «Devuelta por {who} el {when}» y el documento de
   devolución), **Cortesía** o **Corrección** (con quién y el motivo). Cada uno con el servicio, la
   fecha, «Cliente: <nombre>» y, si la hay, «Venta: <identificador interno de la venta>».
3. Una sesión devuelta a un bono ya caducado lo dice: «La sesión ha vuelto a un bono que ya estaba
   caducado: consta en el bono, pero no se puede gastar mientras el bono no vuelva a estar vigente.».
4. **Cargar más** trae la página siguiente.
Entra: las sesiones y los ajustes de ese bono; nombres de Clientes (CUSTOMERS-F30) y de los usuarios del hub.
Sale: nada; solo lectura.
Si falla: «No se han podido cargar los movimientos». Vacía: «Este bono aún no se ha usado.».
Implicados: CUSTOMERS-F30
QA: B-08

### SERVICES-F20 Un bono caduca
Estado: hecho
Actor: sistema
Pantalla: ninguna
Pasos:
1. Un bono con «Vigencia (días)» caduca ese número de días después de su compra, más los días
   regalados con **Ajustar**.
2. Desde ese momento deja de ofrecerse en el cobro y gastarlo se rechaza con «Este bono ha caducado.».
3. Sus sesiones sin usar se quedan en el bono; **Ajustar → Días que se alarga** lo revive (SERVICES-F18).
Entra: la fecha de compra, la vigencia vendida y los días regalados.
Sale: nada se escribe al caducar; no se avisa a la clienta ni al salón. Devolver una sesión a un bono
caducado sigue permitido, con aviso (SERVICES-F26).
Si falla: no aplica.
Implicados: ninguno
QA: B-08

### SERVICES-F21 Gastar una sesión fuera del cobro
Estado: parcial — no hay pantalla, solo el asistente o la API; no comprueba que el bono cubra el servicio prestado; y una sesión gastada así no se puede deshacer ni devolver (solo compensarla con **Ajustar**)
Actor: empleado, cajero, responsable, asistente
Pantalla: asistente
Pasos:
1. Pide al asistente que gaste una sesión de un bono comprado por la clienta, y si quieres que la enlace a la cita o a la venta.
2. Antes puede preguntarse si se podría y por qué no.
Entra: la compra del bono; la cita y la venta, como referencia.
Sale: una sesión **Entregada** al momento (`services.package.redeemed`), que cuenta contra los «Usos» del bono. No emite documento fiscal.
Si falla: «Este cliente no tiene ese bono: nadie se lo ha vendido.», «Este bono está anulado: ya no se
puede usar.», «Este bono ya no tiene sesiones disponibles.», «Este bono ha caducado.» o «Ese paquete
no existe en este negocio.». Devolverla después se rechaza con «Esa sesión del bono nunca se cobró…».
Implicados: ninguno
QA: ninguno
