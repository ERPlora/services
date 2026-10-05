# WORKFLOW — Servicios · Los bonos cuando cambia la ficha de la clienta

Prefijo: SERVICES

## Flujos

### SERVICES-F28 Unir dos fichas: los bonos pasan a la que queda
Estado: hecho
Actor: sistema
Pantalla: ninguna
Pasos:
1. En Clientes, alguien une dos fichas de la misma persona.
2. Servicios pasa a la ficha que queda todos los bonos de la absorbida (vivos y anulados) y todas sus sesiones (retenidas, gastadas, soltadas y devueltas).
3. Si las dos tenían el mismo bono, quedan dos compras en la misma ficha, cada una con su saldo y su caducidad, y el cobro las ofrece por su orden (SERVICES-F22).
Entra: la ficha que queda y la absorbida (avisa Clientes: `customer.merged`).
Sale: los bonos y las sesiones apuntando a la ficha que queda; si alguno estaba en **Bonos sin
cliente**, sale de ahí. Importes, fechas y movimientos no cambian. Solo dentro de este negocio.
Si falla: no hay pantalla; repetir el aviso no cambia nada, y unir una ficha consigo misma no hace nada.
Implicados: CUSTOMERS-F13
QA: L-10

### SERVICES-F29 Eliminar o anonimizar una ficha: sus bonos quedan sin cliente
Estado: hecho
Actor: sistema
Pantalla: ninguna
Pasos:
1. En Clientes, un administrador elimina una ficha o borra sus datos personales.
2. Servicios sella con la fecha los bonos vivos de esa ficha: pasan a **Bonos sin cliente** (SERVICES-F30).
3. Las sesiones, el importe pagado y los movimientos no cambian.
Entra: la ficha eliminada o anonimizada (avisa Clientes: `customer.deleted`, `customer.anonymized`).
Sale: los bonos sellados como sin cliente. El identificador de la ficha se queda en el bono: es lo
único que lo casa con la venta que lo pagó. Las notas y los motivos libres de esos bonos no se vacían
(hueco de la familia RGPD; ver el inventario del índice). Los bonos anulados no se sellan.
Si falla: no hay pantalla; repetir el aviso conserva la fecha del primero.
Implicados: CUSTOMERS-F07, CUSTOMERS-F16
QA: L-10

### SERVICES-F30 Rescatar los bonos sin cliente
Estado: parcial — la hoja solo enseña la lista: no tiene ninguna acción, no enlaza la venta que pagó el bono, y pasar el bono a otra ficha, que su texto sugiere, no existe (services#79, ADR-0390); y un bono ilimitado sale como «Quedan 0 sesión(es)», aunque no está agotado
Actor: responsable
Pantalla: Bonos y paquetes
Pasos:
1. En **Bonos y paquetes** pulsa **Bonos sin cliente**.
2. Sale cada bono cuya ficha se eliminó o se anonimizó, el más reciente primero: «Quedan {remaining}
   sesión(es)» o «Agotado», el bono, el importe pagado, «Cliente borrado el {when}», «Caducado» si lo
   está y «Referencia del cliente: <identificador>». No hay nombre, correo ni teléfono. Un bono
   ilimitado sale como «Quedan 0 sesión(es)», aunque no está agotado.
3. Para devolver el dinero, busca la venta en **Ventas** y haz una devolución; para anular el bono si
   no se usó, ábrelo desde **Bonos vendidos** de ese bono, donde sale con el identificador en lugar
   del nombre (SERVICES-F17).
4. **Cargar más** (con «{shown} de {total}») trae la página siguiente; **Cerrar** vuelve a la tabla.
Entra: los bonos vivos sellados como sin cliente.
Sale: nada; solo lectura.
Si falla: «No se han podido cargar los bonos sin cliente.». Vacía: «Ningún bono se ha quedado sin cliente.».
Implicados: CUSTOMERS-F07, SALES-F31
QA: L-10
