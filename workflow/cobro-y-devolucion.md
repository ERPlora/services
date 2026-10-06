# WORKFLOW — Servicios · El bono en el cobro y en la devolución

Prefijo: SERVICES

## Flujos

### SERVICES-F22 Pagar una línea con un bono
Estado: parcial — tras recargar la pantalla o volver a una cuenta aparcada, el hueco enseña la sesión como gastada pero el TPV ya no da la línea por cubierta: la cobra a su precio y al cobrar la sesión también se gasta, así que la clienta paga dos veces; el servidor de Ventas da por pagada con bono la línea que diga el cobro, sin preguntar a Servicios, así que por el asistente o la API una línea se cobra a 0 sin sesión detrás (SALES-F27); si la cuenta se divide o se une a otra, la sesión retenida se queda en la cuenta original (ver Si falla); y cobrar solo una parte de la cuenta gasta también las sesiones de las líneas que no se cobran (SERVICES-F24) (leído en el código, sin ejecutar)
Actor: cajero, empleado, responsable
Pantalla: Ventas: Cobro
Pasos:
1. Con la clienta asignada a la cuenta, abre el cobro. En «Líneas pagadas de otra forma», cada línea
   de servicio enseña el hueco de Servicios con los bonos de esa clienta que cubren ese servicio,
   tienen sesiones y no han caducado (una línea de varias unidades se separa antes, SALES-F27).
2. Viene elegido el bono que se gasta primero, con el porqué: primero uno con sesiones contadas antes
   que uno ilimitado, después el que antes caduca, el ya empezado, al que le quedan menos sesiones y
   el comprado antes. Con dos o más dice «{count} bonos válidos». Toca otra tarjeta para gastar otro.
3. Revisa «Quedan {before} sesiones · {after} después de esta» y pulsa **Gastar una sesión**.
4. Sale «{name}: sesión gastada. Quedan {after}.» y la línea deja de cobrarse (Ventas). **Deshacer**
   la devuelve mientras la venta no esté cobrada.
5. Cobra lo demás con su medio (SERVICES-F24). Si se cierra la hoja y se vuelve a abrir sin salir de
   la cuenta, la línea sigue cubierta. Si se recarga la pantalla, o se aparca la cuenta y se vuelve a
   ella, el hueco enseña «{name}: sesión gastada. Quedan {after}.» con **Deshacer**, pero el TPV
   vuelve a cobrar la línea a su precio, y al cobrar la sesión también se da por gastada: la clienta
   paga el servicio y además pierde la sesión. Hasta que se arregle, pulsa **Deshacer** y vuelve a
   pulsar **Gastar una sesión** (leído en el código, sin ejecutar).
Entra: la clienta, la cuenta, la línea y su servicio (Ventas); los bonos comprados por la clienta (Servicios).
Sale: una sesión **Reservada** para esa línea durante un día (`services.package.held`), que ya no
se puede gastar en otra; el aviso al cobro de que la línea está cubierta. No emite documento fiscal:
el bono se declaró al venderlo.
Si falla: si no se pueden leer los bonos, «No se han podido cargar los bonos del cliente. Inténtalo
otra vez antes de cobrar el precio completo.» con **Reintentar**, nunca «no tiene bonos». Sin bonos:
«Este cliente no tiene ningún bono que cubra este servicio.». Al gastar: «Este bono ya no tiene
sesiones disponibles.», «Este bono ha caducado.», «Este bono está anulado: ya no se puede usar.»,
«Este bono no cubre ese servicio. Un bono de cortes paga cortes, no el champú.» o «No se ha podido
reservar la sesión de ese bono.». Si otra caja gasta a la vez la última sesión, la segunda espera y
recibe el motivo real. **Deshacer** tras cobrar: «Esa sesión del bono ya no se puede devolver: la
venta está cobrada. Devolverla es una devolución, y va por su propia puerta.». Si la cuenta se
divide, la sesión retenida sigue en la cuenta original: si esa cuenta se cobra antes de que pase el
día, la sesión se da por gastada con esa venta aunque la línea se cobre en la otra, y si en la nueva
se gasta otra, la clienta pierde dos; si no se cobra, vuelve sola al bono al cabo de un día. Si se
juntan dos cuentas, la absorbida se anula sin aviso y su sesión retenida no se gasta al cobrar la
que queda: vuelve sola al bono al cabo de un día, y el hueco de la que queda ofrece gastar otra
(leído en el código, sin ejecutar).
Implicados: SALES-F17, SALES-F23, SALES-F24, SALES-F27, REC_PELUQUERIA-F10
QA: B-08

### SERVICES-F23 Soltar la sesión si la línea o la cuenta desaparecen
Estado: parcial — pedir por el asistente o la API que se quite una línea ya enviada a cocina no la quita, pero Ventas avisa igual y Servicios suelta la sesión que la cubría: la línea se queda en la cuenta sin sesión detrás
Actor: sistema
Pantalla: ninguna
Pasos:
1. Quien cobra quita de la cuenta abierta una línea que cubría un bono, o elimina la cuenta entera (Ventas).
2. Servicios oye el aviso y devuelve al bono la sesión retenida de esa línea, o todas las de esa cuenta.
3. En **Movimientos** la sesión sale como **Liberada**.
Entra: la cuenta y la línea quitada, o la cuenta anulada (avisa Ventas: `sales.order.line_removed`, `sales.order.voided`).
Sale: las sesiones retenidas y sin cobrar de esa línea o de esa cuenta vuelven al bono al momento.
Una sesión ya gastada en una venta cobrada no se toca.
Si falla: no hay pantalla; repetir el aviso no cambia nada. Si el aviso no llega, la sesión vuelve sola al cabo de un día (SERVICES-F25).
Implicados: SALES-F18, SALES-F27, REC_PELUQUERIA-F10
QA: B-08

### SERVICES-F24 Dar por gastadas las sesiones al cobrar
Estado: parcial — las sesiones se dan por gastadas por cuenta y no por línea: cobrar solo una parte de la cuenta gasta también las sesiones retenidas en las líneas que se quedan sin cobrar, y tras dividir la cuenta, cobrar la original gasta la sesión de una línea que se fue a la otra (leído en el código, sin ejecutar)
Actor: sistema
Pantalla: ninguna
Pasos:
1. Se cobra una cuenta con líneas pagadas por bono (Ventas).
2. Servicios oye la venta cobrada y da por **Entregadas** todas las sesiones retenidas en esa cuenta,
   enlazadas a la venta, sin mirar qué líneas entraron en el cobro. En el mismo paso concede los bonos que se vendieran en ese tique (SERVICES-F14).
3. Desde ese momento ya no se pueden deshacer: solo vuelven con una devolución (SERVICES-F26) o
   anulando la venta (SERVICES-F27).
Entra: la venta cobrada, con su cuenta, su clienta y sus líneas (avisa Ventas: `sale.completed`).
Sale: las sesiones gastadas para siempre y enlazadas a la venta. No emite documento fiscal ni aviso
propio. Cobrar solo una parte de la cuenta da por gastadas también las sesiones retenidas en líneas
que se quedan sin cobrar; esas líneas, al cobrarse después, ya no van cubiertas en el TPV (o su hueco
ofrece gastar otra sesión) (leído en el código, sin ejecutar).
Si falla: no hay pantalla; el hub reintenta el aviso. Repetirlo no gasta ni concede dos veces. Si
nunca llega a procesarse, las sesiones siguen retenidas y vuelven solas al bono al cabo de un día
(SERVICES-F25) aunque la línea se cobró a 0 (leído en el código, sin ejecutar). Eso pasa, por
ejemplo, si el tique vendía un bono desactivado por la API (SERVICES-F14): falla entero, también el
gasto de las sesiones.
Implicados: SALES-F01, SALES-F22, SALES-F23, SALES-F27, REC_PELUQUERIA-F10
QA: B-08

### SERVICES-F25 La sesión retenida que nadie cobra vuelve sola
Estado: hecho
Actor: sistema
Pantalla: ninguna
Pasos:
1. Una sesión retenida en un cobro tiene un día de plazo para cobrarse (por ejemplo, una cuenta aparcada y olvidada).
2. Pasado el plazo deja de contar en el saldo del bono al momento; la siguiente vez que alguien gasta
   una sesión de cualquier bono, o en la tarea que corre cada hora, queda marcada como **Caducada** en
   **Movimientos**.
3. Si se vuelve a esa cuenta, el hueco del cobro ya no la enseña como gastada y ofrece el bono de nuevo.
Entra: las sesiones retenidas y sin cobrar, y su plazo.
Sale: la sesión de vuelta en el bono. La tarea de cada hora emite `services.package.hold_released`
en cada pasada, haya soltado algo o no y sin decir qué sesiones; si la sesión la libera otro gasto,
no hay aviso.
Si falla: no hay pantalla; si la tarea no corre, la sesión vuelve igual en cuanto pasa el plazo.
Implicados: SALES-F17, REC_PELUQUERIA-F10
QA: ninguno

### SERVICES-F26 Devolver la sesión al devolver la venta
Estado: parcial — la sesión solo vuelve junto con una devolución de dinero: en un tique pagado entero con bono (0,00 €), **Devolver** dice «No queda nada por devolver en esta venta.» y no enseña este hueco (el servidor de Ventas rechaza además una devolución sin dinero), así que la sesión solo vuelve anulando la venta (SERVICES-F27) o con **Ajustar → Añadir sesiones** (SERVICES-F18); en un tique pagado con bono y dinero la sesión sola no se puede devolver mientras quede dinero (hay que devolver algo de dinero a la vez, sales#512), y una vez devuelto todo el dinero la venta pasa a Devuelta y **Devolver** queda desactivado: también entonces, solo **Ajustar**
Actor: responsable
Pantalla: Ventas: Devolver
Pasos:
1. En **Ventas**, pulsa **Devolver** en la venta. En cada línea que pagó un bono sale el hueco de
   Servicios con «Devolver la sesión a {name}» ya marcado y «Quedan {before} sesiones · {after} tras
   esta devolución». Desmárcalo si la sesión no debe volver.
2. Si el bono ya caducó, el aviso «{name} caducó el {date}. La sesión vuelve al bono igualmente.» sale junto al botón de devolver.
3. Pulsa el botón de devolver de Ventas, con algún importe de dinero. Cuando el documento de devolución existe, Servicios devuelve
   la sesión y la ventana espera a que termine: «{name}: la sesión ha vuelto al bono.».
4. Dos líneas del mismo servicio en el tique (madre e hija con el mismo corte) devuelven cada una su sesión.
Entra: la venta, sus líneas pagadas por bono y el documento de devolución (Ventas); las sesiones gastadas en esa venta.
Sale: la sesión de vuelta en el bono, con quién, cuándo y el documento (`services.package.refunded`);
en **Movimientos**, **Devuelta**. No mueve dinero ni emite documento; si el bono estaba caducado, la
sesión consta pero no se puede gastar hasta alargarlo. El mismo documento dos veces devuelve una
sola sesión.
Si falla: si no se pueden leer las sesiones, «No se han podido leer las sesiones de bono de esta
venta. Inténtalo otra vez antes de terminar la devolución.» con **Reintentar**, y la ventana no la da
por resuelta. Una sesión ya devuelta: «Esta sesión ya se devolvió en otra devolución.». Si falla al
devolverla, «No se ha podido devolver esa sesión al bono.» y Ventas avisa de que el dinero volvió
pero eso no.
Implicados: SALES-F31, SALES-F32, REC_PELUQUERIA-F14
QA: B-08

### SERVICES-F27 Devolver la sesión al anular la venta
Estado: hecho
Actor: sistema
Pantalla: ninguna
Pasos:
1. Un responsable anula en Ventas una venta cobrada (SALES-F30). Ventas solo anula una venta sin
   devoluciones y sin factura completa, así que la anulación deshace el tique entero.
2. Servicios oye la anulación y devuelve a su bono cada sesión gastada en esa venta, como una
   devolución completa (SERVICES-F26), aunque el bono haya caducado.
3. En **Movimientos** cada una sale como **Devuelta**, con quien anuló la venta, la hora y el motivo
   de la anulación; la venta anulada hace de documento.
4. Si en ese tique se vendió un bono y no se ha gastado ni reservado ninguna sesión suya, se anula
   igual que con **Anular** en **Bonos vendidos** (SERVICES-F17): «Anulado por {who} el {when}» y el
   motivo de la anulación.
Entra: la venta anulada, quién la anuló y el motivo (avisa Ventas: `sale.voided`); las sesiones
gastadas en esa venta y los bonos vendidos en ella.
Sale: las sesiones de vuelta en su bono y los bonos intactos de esa venta anulados. Una sesión ya
devuelta por otra devolución, una gastada en la silla que solo nombra la venta, y un bono concedido a
mano, aunque nombre la venta, no se tocan. No mueve dinero ni emite documento fiscal (eso es de
Ventas) ni emite aviso propio.
Si falla: no hay pantalla; repetir el aviso no devuelve ni anula dos veces. Un bono vendido en esa
venta que ya se usó sigue vivo: se corrige con **Ajustar** (SERVICES-F18). Si una caja está
reservando una sesión de ese bono en el mismo instante, la anulación la espera y, como el bono ya
está en uso, no lo anula.
Implicados: SALES-F30, REC_PELUQUERIA-F14
QA: B-08
