# WORKFLOW — Servicios · El bono en el cobro y en la devolución

Prefijo: SERVICES

## Flujos

### SERVICES-F22 Pagar una línea con un bono
Estado: parcial — el servidor de Ventas da por pagada con bono la línea que diga el cobro, sin preguntar a Servicios, así que por el asistente o la API una línea se cobra a 0 sin sesión detrás (SALES-F27); y si la cuenta se divide o se une a otra, la sesión retenida se queda en la cuenta original: al cobrar la otra no se da por gastada, vuelve sola al bono al cabo de un día y el hueco de la cuenta nueva ofrece gastar otra (leído en el código, sin ejecutar)
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
5. Cobra lo demás con su medio (SERVICES-F24). Si se cierra la hoja o se recarga la pantalla antes
   de cobrar, el hueco vuelve como «sesión gastada» con **Deshacer**, no como una oferta nueva.
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
venta está cobrada. Devolverla es una devolución, y va por su propia puerta.».
Implicados: pendiente
Pendiente de enlazar: sales — ofrecer el bono por línea, retener la sesión y gastarla al cobrar (SALES-F27)
Pendiente de enlazar: sales — dividir la cuenta no avisa a Servicios y la sesión retenida se queda en la original (SALES-F23)
Pendiente de enlazar: sales — juntar cuentas anula la absorbida sin aviso y su sesión retenida no se gasta al cobrar (SALES-F24)
Pendiente de enlazar: REC_PELUQUERIA — el día completo del salón, cobro con bono
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
Implicados: pendiente
Pendiente de enlazar: sales — quitar una línea lo anuncia, también si no se quitó por estar ya en cocina (SALES-F27)
Pendiente de enlazar: sales — soltar las sesiones de bono retenidas en esa cuenta (SALES-F18)
QA: B-08

### SERVICES-F24 Dar por gastadas las sesiones al cobrar
Estado: hecho
Actor: sistema
Pantalla: ninguna
Pasos:
1. Se cobra una cuenta con líneas pagadas por bono (Ventas).
2. Servicios oye la venta cobrada y da por **Entregadas** todas las sesiones retenidas en esa cuenta,
   enlazadas a la venta. En el mismo paso concede los bonos que se vendieran en ese tique (SERVICES-F14).
3. Desde ese momento ya no se pueden deshacer: solo vuelven con una devolución (SERVICES-F26).
Entra: la venta cobrada, con su cuenta, su clienta y sus líneas (avisa Ventas: `sale.completed`).
Sale: las sesiones gastadas para siempre y enlazadas a la venta. No emite documento fiscal ni aviso propio.
Si falla: no hay pantalla; el hub reintenta el aviso. Repetirlo no gasta ni concede dos veces. Si
nunca llega a procesarse, las sesiones siguen retenidas y vuelven solas al bono al cabo de un día
(SERVICES-F25) aunque la línea se cobró a 0 (leído en el código, sin ejecutar).
Implicados: pendiente
Pendiente de enlazar: sales — la venta cobrada que avisa a Servicios (SALES-F01)
Pendiente de enlazar: sales — gastar la sesión al cobrar (SALES-F27)
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
Sale: la sesión de vuelta en el bono (`services.package.hold_released`, cuando la marca la tarea de cada hora).
Si falla: no hay pantalla; si la tarea no corre, la sesión vuelve igual en cuanto pasa el plazo.
Implicados: pendiente
Pendiente de enlazar: sales — una cuenta aparcada más de un día pierde la sesión retenida (SALES-F17)
QA: ninguno

### SERVICES-F26 Devolver la sesión al devolver la venta
Estado: parcial — en un tique pagado con bono y dinero no se puede devolver solo la sesión mientras quede dinero (sales#512), y una vez devuelto todo el dinero la venta pasa a Devuelta y **Devolver** queda desactivado, así que la sesión ya no se puede devolver desde Ventas; solo compensarla con **Ajustar** (SERVICES-F18)
Actor: responsable
Pantalla: Ventas: Devolver
Pasos:
1. En **Ventas**, pulsa **Devolver** en la venta. En cada línea que pagó un bono sale el hueco de
   Servicios con «Devolver la sesión a {name}» ya marcado y «Quedan {before} sesiones · {after} tras
   esta devolución». Desmárcalo si la sesión no debe volver.
2. Si el bono ya caducó, el aviso «{name} caducó el {date}. La sesión vuelve al bono igualmente.» sale junto al botón de devolver.
3. Pulsa el botón de devolver de Ventas. Cuando el documento de devolución existe, Servicios devuelve
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
Implicados: pendiente
Pendiente de enlazar: sales — devolver al bono la sesión de una línea devuelta (SALES-F32)
Pendiente de enlazar: sales — la ventana de devolución y su documento (SALES-F31)
QA: B-08

### SERVICES-F27 Devolver la sesión al anular la venta
Estado: no hecho — Servicios no escucha la anulación de una venta: las sesiones gastadas en una venta anulada siguen **Entregadas**, y como una venta anulada no se puede devolver, no vuelven por ninguna pantalla salvo **Ajustar**
Actor: sistema
Pantalla: ninguna
Pasos:
1. Un responsable anula en Ventas una venta cobrada con líneas pagadas por bono.
2. Cada sesión gastada en esa venta debería volver a su bono, como en una devolución (SERVICES-F26). Hoy no vuelve ninguna.
3. Mientras tanto: **Bonos y paquetes → Bonos vendidos → Ajustar → Añadir sesiones**, con el motivo (SERVICES-F18).
Entra: la venta anulada (Ventas avisa `sale.voided`; Servicios no lo escucha).
Sale: hoy, nada.
Si falla: no aplica.
Implicados: pendiente
Pendiente de enlazar: sales — la sesión de bono gastada en la venta anulada no vuelve al bono (SALES-F30)
QA: B-08
