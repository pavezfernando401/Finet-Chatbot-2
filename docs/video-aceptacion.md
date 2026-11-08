# Video de aceptación del asistente virtual de Finet

Guion para grabar, en un solo video, que el asistente virtual del sitio hace lo
que piden sus casos de uso. Cada escena dice qué hacer, qué escribir y qué
tiene que aparecer en pantalla. Al final hay una tabla para marcar lo que se
acepta.

**Duración estimada:** 15 a 20 minutos de grabación.

**Qué cubre:** CU-63, CU-64, CU-65, CU-66, CU-77, CU-81, CU-82 y CU-83.

**Qué no cubre:**

- **CU-70** (un operador retoma la conversación en el chat) y **CU-79**
  (auditar el historial de sesiones) no están implementados. Hoy, derivar a
  una persona deja un ticket para el equipo o recomienda el WhatsApp.
- **Las fallas internas** (que el motor de IA o el sistema de soporte no
  respondan) no se pueden provocar desde el sitio. Si se quieren ver, el
  equipo las muestra aparte en un ambiente de pruebas (ver el anexo).

---

## Antes de grabar

### Lo que entrega el equipo

| Qué | Para qué |
|---|---|
| La dirección del sitio donde se graba | Todas las escenas. |
| **RUT A**: un cliente real de Finet, con al menos una factura pendiente | Identificarse (escena 5), ver el saldo (escena 6), reportar una falla y derivar (escenas 9 y 10). |
| **Correo y contraseña del Portal Cliente** de ese mismo RUT A | Reportar una falla (escena 9). |
| **RUT B**: un RUT válido que **no** sea cliente de Finet | Mostrar qué pasa con un RUT desconocido (escena 3). |

### Avisos

- **Se crean dos tickets reales** en el sistema de soporte (escenas 9 y 10).
  Avisa antes a Soporte para que no los atiendan como casos verdaderos, y
  ciérralos al terminar.
- Usa una **ventana normal** del navegador, no de incógnito: la escena 7
  necesita que el navegador recuerde la conversación.
- **No escribas más de 10 mensajes por minuto**, salvo en la escena 8, que
  lo hace a propósito. Pasado ese límite el chat pide esperar un minuto.
- Las respuestas las escribe una IA, así que **la redacción puede variar**
  de un intento a otro. Lo que se evalúa es el contenido. Los textos entre
  comillas en bloque (`>`) son fijos y deben aparecer tal cual.

### Grabación

- Graba la pantalla completa, con la barra de direcciones visible.
- Antes de cada escena, di en voz alta su número y el caso de uso (por
  ejemplo: "Escena 4, CU-81: reiniciar la conversación").
- Si una escena falla, no cortes: anótalo en la tabla final y sigue.

---

## Escenas

### Escena 1 — Abrir el asistente (CU-82)

1. Abre la página de inicio del sitio.
2. Muestra el botón redondo abajo a la derecha y haz clic en él.

**Debe aparecer:**

- Un panel titulado **"Asistente Finet"**, con el subtítulo "Respuestas
  automáticas".
- El saludo: "¡Hola! Soy el asistente virtual de Finet. ¿En qué te puedo
  ayudar?"
- Bajo el campo de texto, el aviso: "Las respuestas las genera una IA y
  pueden contener errores. Solo te pediremos tu RUT para identificarte: nunca
  compartas contraseñas…", con un enlace a WhatsApp.

3. Presiona **Escape**: el panel se cierra. Vuelve a abrirlo con el botón.

### Escena 2 — Consultas generales, sin dar el RUT (CU-63, CU-65)

1. Escribe: `hola`

**Debe aparecer**, siempre igual:

> ¡Hola! Antes de seguir, ¿me indicas tu RUT? Así puedo ayudarte con tus
> planes y tu servicio. Si prefieres no darlo, cuéntame tu consulta y te
> ayudo con información general de Finet.

2. Escribe: `Prefiero no darlo. ¿Qué planes tienen y cuánto cuestan?`

**Debe aparecer:** los planes con su velocidad y su precio mensual.

3. En otra pestaña, abre la página **Planes** del sitio y muestra que los
   nombres y precios son **los mismos**. Vuelve al chat.
4. Escribe: `¿Tienen cobertura en Puente Alto?`

**Debe aparecer:** que hay cobertura en La Pintana, La Granja, La Florida y
Puente Alto, con la recomendación de revisar la dirección exacta en el mapa
de cobertura del sitio o por WhatsApp.

5. Escribe: `¿Tienen alguna promoción?`

**Debe aparecer:** que no tiene información de promociones. **No debe
inventar ninguna.**

6. Escribe: `¿Cuánto debo?`

**Debe aparecer:** que para ver datos de su cuenta necesita su RUT.

### Escena 3 — RUT que no es cliente (CU-63, excepción 1)

1. Escribe el **RUT B**.

**Debe aparecer**, al inicio de la respuesta:

> No pude verificar tu identidad con ese RUT, así que seguiré ayudándote con
> consultas generales.

### Escena 4 — Reiniciar la conversación (CU-81)

1. Haz clic en el ícono **"Nueva conversación"** (la flecha circular, arriba
   en el panel).

**Debe pasar:** los mensajes desaparecen y queda solo el saludo.

2. Escribe: `hola`

**Debe aparecer** otra vez el pedido de RUT de la escena 2: es una
conversación nueva.

### Escena 5 — Identificarse con el RUT (CU-63)

1. Escribe: `Mi RUT es ` seguido del **RUT A**.

**Debe aparecer:** una respuesta que llama al cliente **por su nombre**.

2. Escribe: `¿Qué plan tengo contratado?`

**Debe aparecer:** el plan del cliente y el estado de su contrato.

### Escena 6 — Saldo y facturas (CU-64)

1. Escribe: `¿Cuánto debo y cuándo vence?`

**Debe aparecer:** el saldo total, las facturas pendientes con su período y
monto, y si están vencidas o por vencer, con fechas en formato chileno
(por ejemplo, 20-11-2026).

2. En otra pestaña, abre **Consultar deuda** del sitio, ingresa el RUT A y
   muestra que el saldo es **el mismo**. Vuelve al chat.

### Escena 7 — Retomar la conversación (CU-82)

1. Recarga la página (F5) y abre el asistente.

**Debe pasar:** los mensajes anteriores siguen ahí.

2. Escribe: `¿Y cuál es mi velocidad?`

**Debe pasar:** responde sin volver a pedir el RUT.

### Escena 8 — Límite de mensajes (CU-83)

1. Envía `ok` una y otra vez, apenas se habilite el botón de enviar (se
   bloquea mientras llega cada respuesta), hasta pasar los 10 mensajes en
   el mismo minuto. Si las respuestas tardan y no alcanzas, espera un minuto
   y vuelve a intentarlo.

**Debe aparecer**, en algún momento:

> Estás enviando mensajes muy seguido. Espera un momento e inténtalo de nuevo.

Y el mensaje rechazado vuelve al campo de texto, sin duplicarse en la
conversación.

2. **Espera un minuto completo** antes de la escena siguiente.

### Escena 9 — Reportar una falla (CU-66)

**Primero sin sesión iniciada:**

1. Escribe: `No tengo internet desde ayer.`

**Debe aparecer:**

> Para registrar un reporte de falla necesito que inicies sesión en tu
> cuenta en el sitio de Finet y me escribas desde el chat de ahí. Si
> prefieres, puedo derivarte con una persona de nuestro equipo.

**Ahora con sesión:**

2. Inicia sesión en el **Portal Cliente** con el correo y la contraseña del
   RUT A.
3. Abre el asistente. Si pide el RUT, dale el RUT A.
4. Escribe: `No tengo internet desde ayer.`

**Debe aparecer:** una lista de categorías, entre ellas "Falla de Internet",
con la pregunta de cuál corresponde.

5. Responde lo que vaya pidiendo, por ejemplo:
   `Falla de Internet. Desde ayer en la tarde, en mi casa. Ya reinicié el router.`

**Debe aparecer**, con un código distinto:

> Tu reporte quedó registrado. El identificador de tu solicitud es
> FIN-2026-000124. Nuestro equipo de soporte revisará la falla y te
> contactará.

6. Anota el código y muestra en el Portal Cliente que la solicitud aparece
   en tus tickets.

### Escena 10 — Derivar a una persona, cliente identificado (CU-77)

1. Escribe: `Quiero hablar con una persona.` Si el asistente pide
   confirmación, responde `sí`.

**Debe aparecer**, con un código distinto:

> Generé un reporte con el código FIN-2026-000123 para que una persona de
> nuestro equipo te atienda. Te contactaremos a la brevedad. Desde aquí ya no
> podré responder más mensajes en esta conversación.

**Y además:**

- El campo de texto se reemplaza por "Esta conversación terminó." y el botón
  **"Iniciar nueva conversación"**.
- El ticket queda registrado con el historial de la conversación. Si el
  equipo de Soporte puede, que lo muestre en el CRM.

### Escena 11 — Derivar a una persona, sin identificarse (CU-65)

1. Haz clic en **"Iniciar nueva conversación"**.
2. Escribe `hola` y luego `Prefiero no darlo.`
3. Escribe: `Quiero hablar con una persona.` Si el asistente pide
   confirmación, responde `sí`.

**Debe aparecer:**

> Te recomiendo seguir esta consulta con una persona de nuestro equipo por
> WhatsApp, al +56 9 4500 2319. Desde aquí ya no podré responder más mensajes
> en esta conversación.

**Y** la conversación termina, igual que en la escena 10.

4. Recarga la página y abre el asistente. **Debe seguir terminada**, solo con
   el botón "Iniciar nueva conversación".

**Fin de la grabación.** Cierra los dos tickets de prueba (escenas 9 y 10).

---

## Tabla de aceptación

| Escena | CU | Qué se acepta | ✔ / ✘ | Observaciones |
|---|---|---|---|---|
| 1 | CU-82 | El asistente se abre desde cualquier página, con saludo y aviso de IA; se cierra con Escape | | |
| 2 | CU-63, CU-65 | Pide el RUT; sin RUT responde consultas generales; los planes y precios coinciden con el sitio; no inventa promociones | | |
| 3 | CU-63 | Un RUT que no es cliente recibe el aviso fijo y sigue en modo general | | |
| 4 | CU-81 | "Nueva conversación" limpia el chat y vuelve a pedir el RUT | | |
| 5 | CU-63 | Con un RUT de cliente lo llama por su nombre y conoce su plan | | |
| 6 | CU-64 | El saldo y las facturas coinciden con Consultar deuda | | |
| 7 | CU-82 | Tras recargar, la conversación sigue sin volver a pedir el RUT | | |
| 8 | CU-83 | Más de 10 mensajes por minuto reciben el aviso y el mensaje no se pierde | | |
| 9 | CU-66 | Sin sesión pide iniciarla; con sesión registra la falla y entrega el código | | |
| 10 | CU-77 | El cliente identificado recibe un código de ticket y la conversación termina | | |
| 11 | CU-65 | Sin identificarse, recomienda el WhatsApp y la conversación termina | | |

**Aceptado por:** ______________________ **Fecha:** ____________

---

## Anexo — Excepciones que muestra el equipo

No se pueden provocar desde el sitio. Si se piden en la aceptación, el
equipo las graba aparte, en un ambiente de pruebas donde puede apagar
servicios a propósito:

| CU | Situación | Qué ve el cliente |
|---|---|---|
| CU-65, excepción 1 | El motor de IA no responde | "No pude responder en este momento…" con el WhatsApp, y la conversación termina. |
| CU-64, excepción 1 | No se puede leer la cuenta | "No fue posible recuperar tu información en este momento…" con el WhatsApp. |
| CU-66, excepción 1 | El sistema de soporte no responde | "No fue posible registrar tu reporte en este momento. Un agente humano tomará tu caso en breve…", y la conversación termina. |
| CU-77, excepción 1 | El ticket no se puede crear | "Una persona de nuestro equipo te atenderá en breve…" con el WhatsApp. Soporte recibe un correo con el caso. |
