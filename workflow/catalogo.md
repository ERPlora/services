# WORKFLOW — Servicios · El catálogo

Prefijo: SERVICES

## Flujos

### SERVICES-F01 Dar de alta un servicio
Estado: hecho
Actor: empleado, responsable
Pantalla: Servicios
Pasos:
1. En **Servicios** pulsa **Nuevo servicio**: se abre el panel lateral.
2. Escribe el Nombre, el Precio (en la moneda del hub: «22,50»; al salir del campo se reescribe con
   la notación del hub) y la Duración (min). Elige una Categoría o deja «Sin categoría».
3. Elige la Categoría fiscal en su lista (son las de Impuestos, por su nombre traducido). Sin ella
   **Crear servicio** no se puede pulsar.
4. Pulsa **Crear servicio**: el panel se cierra y el servicio sale en la tabla como **Activo**, con
   la tarifa **Precio fijo**.
Entra: las categorías de Servicios y las categorías fiscales activas de Impuestos.
Sale: el servicio en oferta y reservable, con su categoría fiscal, sin márgenes, capacidad 1 y
reserva online permitida (`services.service.created`); desde ese momento lo ven la Agenda, Personal,
la respuesta automática de WhatsApp y el TPV. Con la duración vacía se guarda 60 min, también si
los ajustes dicen otra cosa (SERVICES-F11).
Si falla: dentro del panel. Un importe que no se entiende o que se lee de dos maneras no se guarda:
«Esto no es un importe. Escribe una cifra, por ejemplo 12,50.» o «Este importe se puede leer de dos
maneras…»; uno negativo, «Este importe no puede ser negativo.». Una categoría eliminada o de otro
negocio: «Esa categoría no está disponible: no existe en este negocio o se ha eliminado.». Sin
categorías fiscales: «Todavía no hay categorías fiscales. Configúralas en Impuestos antes de añadir
servicios.». Lo tecleado se conserva para corregir. Un cajero ve el botón y el panel, pero al
guardar no pasa nada y no se le dice por qué (no tiene permiso de alta).
Implicados: pendiente
Pendiente de enlazar: taxes — el selector de categoría fiscal del servicio (TAXES-F01)
Pendiente de enlazar: taxes — guardar un servicio con su categoría fiscal; Servicios no comprueba que la clave exista (TAXES-F19)
QA: BD-05, B-02

### SERVICES-F02 Editar un servicio
Estado: parcial — si la categoría del servicio se eliminó, guardar se rechaza hasta elegir otra categoría o «Sin categoría» (leído en el código, sin ejecutar); la pantalla no cambia la tarifa, los márgenes, la capacidad ni si es reservable
Actor: responsable
Pantalla: Servicios
Pasos:
1. Toca la fila del servicio o su **Editar**: el panel se abre con el título «Editando servicio — <nombre>» y los datos cargados.
2. Cambia Nombre, Precio, Duración (min), Categoría o Categoría fiscal (esta no se puede vaciar).
3. Pulsa **Guardar cambios**: el panel se cierra y la tabla se recarga. «Cancelar edición» vuelve al formulario de alta vacío.
Entra: el servicio completo (Servicios) y las categorías fiscales (Impuestos).
Sale: el servicio cambiado (`services.service.updated`); lo que el panel no enseña se conserva. Las
citas ya reservadas conservan el nombre, el precio y la duración que tenían; los bonos ya vendidos no
cambian. La copia del nombre que guarda Personal en cada profesional no se renombra.
Si falla: dentro del panel, «No se ha podido actualizar el servicio: no existe en este negocio, o la
categoría elegida no existe.» (también cuando la categoría que el servicio ya tenía se eliminó,
aunque el campo Categoría salga vacío) o los motivos de importe de SERVICES-F01. Sin permiso de
edición, tocar la fila no abre nada.
Implicados: pendiente
Pendiente de enlazar: taxes — el selector de categoría fiscal del servicio (TAXES-F01)
Pendiente de enlazar: staff — la copia del nombre del servicio en cada profesional no se renombra (STAFF-F10)
Pendiente de enlazar: appointments — la cita conserva nombre, precio y duración del momento de reservar (APPOINTMENTS-F01)
QA: BD-05

### SERVICES-F03 Poner un servicio a precio abierto
Estado: parcial — la tarifa (Por hora, Desde, Variable, Gratis) y los precios mínimo y máximo solo se ponen con el asistente o la API: el formulario siempre guarda Precio fijo
Actor: responsable, asistente
Pantalla: asistente
Pasos:
1. Pide al asistente que dé de alta o cambie un servicio con tarifa «Desde», «Por hora» o «Variable» (por ejemplo, «Mechas desde 65 €»).
2. En **Servicios** la columna Tarifa lo enseña («Desde», «Por hora», «Variable»); editarlo desde el panel conserva la tarifa.
3. En el TPV, al tocar ese servicio se abre la hoja de precio libre con su nombre y su precio como sugerencia, y se cobra lo que se teclee (Ventas).
Entra: la petición al asistente.
Sale: el servicio con su tarifa (`services.service.updated` o `services.service.created`). La
tarifa «Gratis» no fuerza el precio a 0: el TPV cobra el precio guardado. Los precios mínimo y
máximo se guardan y nadie los usa.
Si falla: el asistente explica el rechazo (una tarifa fuera de las cinco, un precio negativo).
Implicados: pendiente
Pendiente de enlazar: sales — un servicio de precio abierto pide su importe al venderse (SALES-F09)
QA: ninguno

### SERVICES-F04 Archivar un servicio
Estado: hecho
Actor: administrador
Pantalla: Servicios
Pasos:
1. En la fila del servicio pulsa **Archivar**.
2. Lee «Archivar servicio»: «<nombre> — dejará de ofrecerse y de poder reservarse. Se conservan su
   histórico y las citas ya reservadas.» y, si Citas está instalada y tiene citas próximas con ese
   servicio, «{count} cita(s) próxima(s) siguen usando este servicio. Conservan su reserva, precio y
   duración; solo dejan de admitirse reservas nuevas.».
3. Pulsa **Archivar** (o **Cancelar**). La fila desaparece de la lista.
Entra: el servicio y, si Citas está instalada, cuántas citas pendientes o confirmadas lo usan.
Sale: el servicio fuera de oferta, no borrado (`services.service.deleted`): deja de salir en la
Agenda, en Personal, en el TPV, en la respuesta de WhatsApp y en el selector de líneas de un bono.
Las citas ya reservadas no cambian. El aviso de citas es un consejo: nunca impide archivar.
Si falla: arriba de la tabla, «No se pudo archivar el servicio» o «Ese servicio no existe en este
negocio.». Si la consulta a Citas falla, el diálogo sale sin la línea de citas.
Implicados: pendiente
Pendiente de enlazar: appointments — cuántas citas próximas usan un servicio, y la reserva deja de ofrecerlo (APPOINTMENTS-F01)
Pendiente de enlazar: sales — el servicio desaparece de la rejilla del TPV (SALES-F01)
QA: BD-05

### SERVICES-F05 Ver y restaurar los servicios archivados
Estado: parcial — en la vista de archivados, tocar una fila abre el panel de edición, y guardar ahí se rechaza
Actor: responsable
Pantalla: Servicios
Pasos:
1. En **Servicios** abre el filtro de la columna Estado y elige **Archivado**: la tabla pasa a enseñar solo los archivados, con su etiqueta gris.
2. En la fila pulsa **Restaurar**. No pide confirmación.
3. El servicio sale de esa vista; al quitar el filtro vuelve a estar en la lista como antes, con su nombre, precio, duración y categoría.
Entra: los servicios archivados o desactivados.
Sale: el servicio otra vez en oferta y reservable (`services.service.updated`).
Si falla: arriba de la tabla, «No se pudo restaurar el servicio» o «No se ha podido recuperar el
servicio: no existe en este negocio, o ya se está ofreciendo.». En la vista de archivados la fila no
ofrece Editar ni Archivar, pero tocarla abre «Editando servicio» y **Guardar cambios** responde «No
se ha podido actualizar el servicio: no existe en este negocio, o la categoría elegida no existe.».
Implicados: pendiente
Pendiente de enlazar: appointments — el servicio vuelve a ofrecerse al reservar (APPOINTMENTS-F01)
Pendiente de enlazar: sales — el servicio vuelve a la rejilla del TPV (SALES-F01)
QA: BD-05

### SERVICES-F06 Dar de alta muchos servicios de golpe
Estado: parcial — no hay importador en pantalla (las tablas de Servicios no ofrecen importar un fichero): solo con el asistente o la API; dos servicios del lote con el mismo nombre (o uno igual a otro creado antes por lote) hacen fallar el lote entero, y la categoría de cada línea no se comprueba que sea de este negocio (leído en el código, sin ejecutar)
Actor: responsable, asistente
Pantalla: asistente
Pasos:
1. Pide al asistente que cree una lista de servicios, cada uno con nombre, precio, duración y categoría fiscal (hasta 500).
2. El asistente responde cuántos se crearon y cuáles no, con su motivo (sin nombre, sin categoría fiscal, tarifa no válida, precio negativo, duración 0).
3. Recarga **Servicios** para verlos: la lista no se refresca sola con un alta por lote.
Entra: la lista de servicios.
Sale: los servicios válidos, en una sola escritura; los inválidos se informan uno a uno y no paran
a los demás. Sin duración se guarda 60 min, sin mirar los ajustes. No se emite ningún aviso.
Si falla: el asistente explica los motivos por línea (en inglés). Un fallo de la escritura deja el lote entero sin crear.
Implicados: pendiente
Pendiente de enlazar: taxes — cada línea del lote exige su categoría fiscal (TAXES-F19)
QA: ninguno

### SERVICES-F07 Crear y editar categorías
Estado: parcial — «Orden» y «Categoría padre» se guardan pero solo se ven en su columna: la tabla, el formulario de servicio y el TPV las listan planas y por nombre; un ciclo de más de un nivel (A dentro de B y B dentro de A) no se impide
Actor: responsable
Pantalla: Categorías
Pasos:
1. En **Categorías** pulsa **Nueva categoría**.
2. Escribe el Nombre y, si quieres, elige la Categoría padre y un Orden.
3. Pulsa **Crear categoría**. Para cambiarla, toca la fila o su **Editar** («Editando categoría — <nombre>»), cambia lo que haga falta y pulsa **Guardar cambios**; una categoría no se ofrece como su propio padre.
Entra: las categorías vivas del negocio.
Sale: la categoría, que aparece en el campo Categoría del formulario de servicio, en el filtro de la
columna Categoría y como pestaña del TPV. Crear o editar categorías no emite aviso.
Si falla: un nombre que ya tiene otra categoría (sin distinguir mayúsculas ni espacios de más; con
tildes distintas sí se acepta) sale debajo del campo: «Ya hay una categoría con ese nombre. Elige
otro nombre.». Un padre eliminado o de otro negocio: «Esa categoría padre no está disponible: no
existe en este negocio o se ha eliminado.» o «No se ha podido actualizar la categoría…». Sin
permiso de alta no aparece **Nueva categoría**.
Implicados: pendiente
Pendiente de enlazar: sales — las categorías de servicio son pestañas de la rejilla del TPV (SALES-F01)
QA: BD-05

### SERVICES-F08 Eliminar una categoría
Estado: parcial — los servicios de la categoría siguen apuntando a ella: en la tabla salen con «—», pero editarlos se rechaza hasta elegirles otra (SERVICES-F02); y sus subcategorías siguen vivas con un padre eliminado
Actor: administrador
Pantalla: Categorías
Pasos:
1. En la fila de la categoría pulsa **Eliminar**.
2. Lee «Eliminar categoría»: «<nombre> — la categoría desaparece; los servicios que contiene se conservan, sin categoría.» y, si tiene servicios, «{count} servicio(s) se quedarán sin categoría.».
3. Pulsa **Eliminar** (o **Cancelar**). La fila desaparece.
Entra: la categoría y cuántos servicios en oferta tiene.
Sale: la categoría eliminada, no borrada; su nombre queda libre para otra. No se emite aviso.
Si falla: arriba de la tabla, «No se pudo eliminar la categoría» o «Esa categoría no existe en este negocio.».
Implicados: pendiente
Pendiente de enlazar: sales — la pestaña de la categoría desaparece del TPV (SALES-F01)
QA: BD-05

### SERVICES-F09 Vender un servicio en el TPV
Estado: parcial — el servidor de Ventas cobra el precio y la categoría fiscal que manda la pantalla sin contrastarlos con este catálogo: por el asistente o la API un servicio se cobra a cualquier precio
Actor: cajero, empleado, responsable
Pantalla: Ventas: Vender
Pasos:
1. En **Vender**, las categorías de servicio salen como pestañas y cada servicio en oferta como baldosa con su precio (salvo que «Mostrar servicios en el TPV» esté apagado en Ventas).
2. Toca el servicio: entra como línea con el precio de este catálogo. Uno de precio abierto pide el importe (SERVICES-F03).
3. Un servicio **Sin configurar** (sin categoría fiscal) sale con la marca «Falta el IVA» y no se vende.
4. Cobra como cualquier venta (Ventas).
Entra: los servicios en oferta, sus categorías y su categoría fiscal (Servicios), que el TPV lee al abrirse.
Sale: la línea de venta con su precio, su IVA y la referencia del servicio; Servicios no anota nada
por vender un servicio suelto (sí reacciona si la línea la pagó un bono, SERVICES-F24).
Si falla: si Servicios no responde, el TPV avisa de que el catálogo de servicios no carga, en vez de enseñarse como si el negocio no vendiera servicios (Ventas).
Implicados: pendiente
Pendiente de enlazar: sales — la rejilla del TPV vende los servicios del catálogo (SALES-F01)
Pendiente de enlazar: sales — un servicio de precio abierto pide su importe (SALES-F09)
Pendiente de enlazar: sales — cobrar una cita lleva su servicio al TPV (SALES-F26)
Pendiente de enlazar: REC_PELUQUERIA — el día completo del salón
QA: B-05, B-06, BD-05

### SERVICES-F10 Entregar el catálogo a Citas, Personal, WhatsApp y Combos
Estado: hecho
Actor: sistema
Pantalla: ninguna
Pasos:
1. Quien reserva una cita, asigna un servicio a un profesional, contesta un WhatsApp o compone un menú no abre Servicios: lee su lista pública de servicios en oferta.
2. La lista trae solo los servicios en oferta (no los archivados), con nombre, precio, tarifa, duración, si es reservable, categoría y categoría fiscal; también los que aún no tienen categoría fiscal.
3. Citas lee además la ficha de un servicio concreto al reservar o mover una cita.
Entra: el catálogo de Servicios.
Sale: nada; Servicios no guarda quién lo lee. Qué profesional hace cada servicio lo guarda Personal,
y la regla «si nadie lo tiene asignado, lo hace todo el equipo reservable» es de Citas.
Si falla: cada lector decide (Citas rechaza reservar sin la ficha del servicio; Personal avisa de que falta el módulo).
Implicados: pendiente
Pendiente de enlazar: appointments — el servicio reservable con su precio y duración (APPOINTMENTS-F01)
Pendiente de enlazar: appointments — nombre, precio y duración del nuevo servicio al mover una cita (APPOINTMENTS-F04)
Pendiente de enlazar: staff — el catálogo del que se elige el servicio de un profesional (STAFF-F10)
Pendiente de enlazar: staff — quién puede hacer un servicio; sin nadie asignado decide Citas (STAFF-F12)
Pendiente de enlazar: whatsapp_inbox — leer servicios y su duración (WHATSAPP_INBOX-F21)
Pendiente de enlazar: REC_WA_CITA — leer servicios y su duración (REC_WA_CITA-F04)
Pendiente de enlazar: combos — un menú puede llevar un servicio como componente
QA: B-02, W-02

### SERVICES-F11 Cambiar los ajustes de Servicios
Estado: parcial — los ajustes no cambian nada de lo que se hace en pantalla: «Duración por defecto (min)», «Tiempo de margen por defecto (min)» y «Permitir reserva online» solo cuentan en un alta por el asistente o la API que no los mande; «Tipo de IVA por defecto», «Mostrar precios», «Mostrar duración», «Precios con IVA incluido» y «Moneda» no los lee nadie
Actor: administrador
Pantalla: Ajustes de Servicios
Pasos:
1. Abre **Servicios → Ajustes**.
2. Cambia los campos y pulsa **Guardar**.
3. Sale «Ajustes guardados.».
Entra: los ajustes guardados (o los de fábrica: 60 min, 0 min, reserva online sí, IVA incluido sí, EUR).
Sale: los ajustes del negocio, que el alta de servicios por el asistente o la API usa como relleno
de duración, márgenes y reserva online cuando no los recibe. El panel de **Nuevo servicio** no los
usa: con la duración vacía guarda 60 min.
Si falla: «No se pudieron guardar los ajustes.»; un valor no admitido se marca en su campo con
«Este valor no se admite.». Quien no es administrador ve los campos en solo lectura con «Solo un
administrador puede cambiar estos ajustes.».
Implicados: ninguno
QA: ninguno
