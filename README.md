# finet-chatbot

Servicio del asistente virtual de Finet. Recibe mensajes de clientes, los pasa
a un modelo de lenguaje (LLM) con el historial de la conversación y devuelve la
respuesta.

Hoy lo usa el **widget de chat del sitio** ([finet-clientes](https://github.com/FSM-Finet-y-Cable-Magico/finet-clientes)).
La integración con **Chatwoot** ya recibe mensajes, pero todavía no envía las
respuestas de vuelta (ver [Estado](#estado)).

```
widget del sitio ──▶ finet-clientes (backend) ──x-api-key──▶ POST /web/messages ─┐
pruebas manuales ─────────────────────────────x-api-key──▶ POST /messages ──────┼─▶ MessagesService ─▶ LLM
Chatwoot ──────────────────────────────webhook firmado──▶ POST /webhooks/chatwoot┘        │
                                                                   historial en memoria  │
                                                    finet-clientes (/api) ◀──────────────┘
                              POST asistente/clientes/identificar          RUT (CU-63)
                              GET  deuda-publica/rut                       saldo (CU-64)
                              GET  asistente/clientes/soporte/categorias   fallas (CU-66)
                              POST asistente/clientes/soporte              fallas (CU-66)
                              POST asistente/clientes/escalamientos        derivación (CU-77)
                              GET  landing/planes                          catálogo de planes
```

Stack: NestJS 12 (ESM, TypeScript), SDK de OpenAI contra cualquier servidor
compatible (Groq, Ollama, OpenRouter, OpenAI), Vitest y oxlint. El modelo
tiene que soportar *tool calling*: así decide cuándo derivar a una persona.

## Puesta en marcha

Para levantar el chat completo junto al sitio, paso a paso y con cómo
comprobar que funciona: [docs/puesta-en-marcha.md](docs/puesta-en-marcha.md).
Para producción, en el mismo VPS que finet-clientes:
[docs/despliegue-vps.md](docs/despliegue-vps.md).

Requisitos: Node.js (se desarrolla con la 24) y pnpm.

```bash
pnpm install
cp .env.example .env   # y completar los valores (ver Configuración)
pnpm start:dev         # http://localhost:3001
```

El servicio **no arranca** si falta alguna variable obligatoria o viene vacía:
mejor fallar al iniciar que en el primer mensaje.

### Junto al sitio en local

| Servicio | Puerto |
|---|---|
| finet-clientes `apps/view` (Next.js) | 3000 |
| finet-clientes `apps/controller` (NestJS) | 4000 |
| finet-chatbot | 3001 |

En `finet-clientes/apps/controller/.env`:

```env
CHATBOT_URL="http://localhost:3001"
CHATBOT_API_KEY="<el mismo valor que API_KEY en este repo>"
ASISTENTE_API_KEY="<el mismo valor que CLIENTES_API_KEY en este repo>"
```

Son dos claves distintas, una por sentido: el sitio llama al bot con
`API_KEY`, y el bot llama al sitio para verificar RUTs con `CLIENTES_API_KEY`.

## Configuración

Todas las variables van en `.env`; [`.env.example`](.env.example) trae los
valores de ejemplo y comentarios. `${VAR}` se expande, así que una clave puede
apuntar a otra variable en vez de copiarse.

| Variable | Obligatoria | Por defecto | Para qué |
|---|---|---|---|
| `OPENAI_BASE_URL` | Sí | — | Servidor del LLM. Cambiar de proveedor es cambiar estas tres líneas. |
| `OPENAI_API_KEY` | Sí | — | Clave del proveedor. Ollama acepta cualquier valor, pero no vacío. |
| `OPENAI_MODEL` | Sí | — | Modelo, p. ej. `openai/gpt-oss-120b` en Groq. |
| `CHATWOOT_WEBHOOK_SECRET` | Sí | — | Secreto con el que Chatwoot firma el webhook. Es obligatorio aunque solo uses el widget. |
| `WHATSAPP_NUMBER` | Sí | — | WhatsApp de Finet que el bot recomienda al derivar a una persona, tal como se muestra al cliente, p. ej. `+56 9 4500 2319`. |
| `API_KEY` | No | — | Protege `POST /messages` y `POST /web/messages`. Sin ella, ambas rutas responden 404. |
| `CLIENTES_API_URL` | No | — | Backend de finet-clientes, p. ej. `http://localhost:4000/api`. Ahí se verifican los RUT (CU-63), se consulta la deuda (CU-64), se registran los reportes de falla (CU-66) y los tickets al derivar (CU-77). |
| `SITE_URL` | No | `https://finet.cl` | Sitio público al que el asistente envía a los clientes (planes, cobertura, ayuda). |
| `CLIENTES_API_KEY` | No | — | Clave para esa verificación; igual a `ASISTENTE_API_KEY` de finet-clientes. Sin estas dos variables el bot arranca igual, pero no puede verificar ningún RUT y todas las conversaciones quedan en modo general. |
| `PORT` | No | `3000` | El ejemplo usa `3001` para no chocar con Next. |
| `HOST` | No | todas las interfaces | En producción, `127.0.0.1` si el backend de finet-clientes corre en la misma máquina: así el bot no queda expuesto a internet. |
| `OPENAI_SYSTEM_PROMPT` | No | Prompt genérico de Finet | Instrucciones del asistente. |
| `OPENAI_TEMPERATURE` | No | `0.3` | |
| `OPENAI_TIMEOUT_MS` | No | `30000` | Por intento. |
| `OPENAI_MAX_RETRIES` | No | `2` | |
| `REPLY_TIMEOUT_MS` | No | `45000` | Tiempo total del LLM para una respuesta, reintentos incluidos (CU-65). Tiene que quedar bajo los 60 s que espera finet-clientes, menos 5 s de la verificación de RUT. |
| `LOG_LEVEL` | No | — | `debug` también registra el texto de los mensajes. Solo para desarrollo. |
| `CHATWOOT_BASE_URL`, `CHATWOOT_API_ACCESS_TOKEN` | No | — | Reservadas para enviar respuestas a Chatwoot. El código aún no las usa. |

## Endpoints

### `GET /health`

Responde `{"status":"ok"}` mientras el proceso esté arriba. No llama al LLM
ni a finet-clientes, así que sirve para el monitoreo de systemd, PM2 o un
balanceador sin costo.

### `POST /web/messages` — widget del sitio

Lo llama el backend de finet-clientes, nunca el navegador: la API key no puede
viajar al cliente y el límite de mensajes por IP vive en ese backend.

```bash
curl -X POST http://localhost:3001/web/messages \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: <API_KEY>' \
  -d '{"sessionId": "3f6c8a52-7d1e-4b9a-9c2f-5e8d1a0b7c64", "content": "¿Qué planes tienen?"}'
```

```json
{ "content": "...", "handedOff": false }
```

`sessionId` es un UUID que genera el widget y **es** la conversación: mismo id,
mismo historial. `content` va de 1 a 4096 caracteres. `accessToken`, opcional,
es la sesión del portal del visitante; solo se usa para registrar reportes de
falla (ver [CU-66](#reporte-de-fallas-cu-66)).

`handedOff: true` indica que la conversación se derivó a una persona (ver
[Derivación](#derivación-a-una-persona)). La respuesta que deriva trae el texto
con el WhatsApp. Los mensajes que lleguen después reciben `content: null`.

### `POST /messages` — pruebas sin Chatwoot

Mismo `X-Api-Key`. Usa los campos de Chatwoot y responde con el cuerpo que
espera su API de mensajes, o `204` sin cuerpo si la conversación ya se derivó:

```bash
curl -X POST http://localhost:3001/messages \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: <API_KEY>' \
  -d '{"accountId": 1, "conversationId": 12, "content": "hola"}'
```

### `POST /webhooks/chatwoot` — Chatwoot

Se configura en Chatwoot en *Settings → Integrations → Webhooks*. Comprueba la
firma `X-Chatwoot-Signature` (HMAC-SHA256 de `{timestamp}.{cuerpo}`) y rechaza
entregas de más de 5 minutos. Solo responde a mensajes entrantes y públicos de
contactos; ignora los del propio bot, las notas privadas y el resto de eventos.
Con firma válida contesta `200` una vez procesado el mensaje.

### Errores comunes

| HTTP | Causa |
|---|---|
| 400 | Cuerpo inválido o con campos de más |
| 401 | Falta la API key o la firma, o no son válidas |
| 404 | `API_KEY` no configurada (las rutas quedan cerradas) |

## Identificación por RUT (CU-63)

Todo es texto, sin botones, para que el mismo flujo sirva en el widget y en
WhatsApp vía Chatwoot.

1. El primer mensaje de una conversación recibe un pedido fijo de RUT, que
   también explica que se puede seguir sin darlo.
2. Si el cliente responde con un RUT válido (`12.345.678-5`, `12345678-5`,
   `123456785`, "mi rut es …"), el bot lo verifica en finet-clientes:
   - **Existe:** el LLM recibe su nombre y sus planes (nombre comercial, tipo,
     velocidad y estado del contrato), y retoma la pregunta que quedó pendiente.
   - **No existe o finet-clientes no responde:** aviso fijo de que no se pudo
     verificar la identidad, y modo general (excepción 1 del CU).
3. Si responde sin RUT, sigue en **modo general**: solo consultas generales. Si
   después pregunta por su cuenta, el bot le pide el RUT, y puede darlo en
   cualquier momento.

Detalles:

- **El RUT nunca llega al LLM.** En el historial se reemplaza por `[RUT]`, y
  los logs solo dicen si se encontró (`found`, `not_found`, `unavailable`).
- **Sin tope de RUTs por conversación**, igual que la consulta pública de
  deuda del sitio. Contra quien pruebe RUTs al azar está el límite de
  mensajes por IP del widget (10 por minuto, en finet-clientes). Chatwoot no
  tiene ese límite.
- **48 horas sin actividad reinician la conversación**: se borra el historial
  y se vuelve a pedir el RUT.
- El RUT **no es una contraseña**: identifica, no autentica. Por eso el bot
  solo recibe datos que el sitio ya muestra a quien conozca un RUT: los de la
  consulta pública de deuda (CU-39).

La trazabilidad completa del caso de uso (cada paso, excepción y poscondición,
con el archivo que lo implementa) y las decisiones que el CU no definía están
en finet-clientes, en `apps/controller/docs/asistente.md`.

## Saldo y facturas (CU-64)

Con el cliente identificado, el LLM tiene una segunda herramienta,
`consultar_cuenta`. La usa cuando el cliente pregunta cuánto debe, por sus
facturas o por sus vencimientos.

1. El bot llama a la consulta pública de deuda de finet-clientes
   (`GET /deuda-publica/rut`, la misma del CU-39) con el RUT que guardó al
   identificarlo. Lo manda con `CLIENTES_API_KEY`: la ruta es pública, pero
   con la clave finet-clientes le da un límite de peticiones propio (600 por
   minuto en vez de 10), porque todas las consultas salen de la IP del bot.
2. Con el saldo y las facturas pendientes (período, monto, `pendiente` o
   `vencida`, días de atraso o para vencer), el LLM responde en una segunda
   llamada, ya sin herramientas. Los montos y las fechas van formateados
   (`$45.990`, `20-09-2026`), para que el LLM no tenga que calcular nada.
3. Si finet-clientes no responde, no encuentra datos para el RUT o no pudo
   leer las facturas, se responde con un texto fijo (excepción 1 del CU):
   "No fue posible recuperar tu información en este momento…", con el
   WhatsApp de soporte.

Detalles:

- **Se consulta en cada pregunta**, no al identificar: un saldo leído hasta
  48 horas antes podría estar pagado.
- **El estado que se informa es el de las facturas.** El estado del contrato
  (activo, suspendido) no está en la consulta pública, y el del equipo
  depende de SmartOLT, que no está integrado.
- **Al LLM solo llegan montos, fechas y estados**, nunca el nombre ni el RUT
  que trae la respuesta. El RUT queda en la memoria del servidor, junto a la
  identidad.
- **En el historial queda la respuesta**, no la consulta: la próxima pregunta
  vuelve a consultar en vez de reutilizar un saldo viejo.

## Reporte de fallas (CU-66)

Con el cliente identificado, el LLM tiene `consultar_categorias_falla`, que usa
cuando el cliente reporta una falla o un problema técnico. Registrar la
solicitud exige además **sesión del portal**: el RUT identifica pero no
autentica, y la solicitud es del propio cliente. finet-clientes manda la cookie
`access_token` del sitio como `accessToken` en `POST /web/messages`; el bot la
reenvía solo al registrar, nunca al LLM ni al historial.

1. **Sin sesión** (no inició sesión en el sitio, o escribe por WhatsApp): texto
   fijo que le pide iniciar sesión y le ofrece derivarlo. No se consulta nada.
2. Con sesión, el bot trae las categorías de finet-clientes
   (`GET /asistente/clientes/soporte/categorias`: las siete que el cliente
   también ve en el portal, como "Falla de Internet" o "Facturación y cobro",
   nunca las internas de otros grupos) y el LLM se las presenta,
   le pide que elija una y describa la falla, y luego la información del
   reporte: desde cuándo ocurre, qué servicio o dirección afecta y qué ha
   intentado.
3. Con todo eso el LLM llama a `crear_solicitud_soporte` con el **nombre** de
   la categoría y la descripción. El bot resuelve el nombre contra la lista
   vigente (sin distinguir mayúsculas ni tildes); si no está, le vuelve a
   mostrar las categorías. Se elige por nombre y no por id porque, pasado el
   turno que las listó, el LLM solo ve lo que le dijo al cliente.
4. El bot registra la solicitud (`POST /asistente/clientes/soporte`) y
   responde con un texto fijo que incluye el identificador:

   > Tu reporte quedó registrado. El identificador de tu solicitud es
   > FIN-2026-000124. Nuestro equipo de soporte revisará la falla y te
   > contactará.

   La categoría es la que dirige el ticket al equipo que corresponde en el
   CRM; queda `ABIERTO`, con `origen: 'ASISTENTE'`. La conversación sigue.

Si finet-clientes rechaza la sesión (`401`: expiró, o es de otro cliente que el
del RUT), el bot le pide volver a iniciar sesión y la conversación sigue.

**Excepción 1:** si las categorías no se pueden leer o la solicitud no se puede
registrar (finet-clientes caído, error o más de 5 s), texto fijo y **la
conversación se deriva**:

> No fue posible registrar tu reporte en este momento. Un agente humano tomará
> tu caso en breve; también puedes escribirnos por WhatsApp al +56 9 4500
> 2319. Desde aquí ya no podré responder más mensajes en esta conversación.

Las llamadas de soporte comparten el plazo del turno (`REPLY_TIMEOUT_MS`): si
se acaba mientras esperan, cuentan como excepción 1.

## Derivación a una persona

Todavía no hay un agente humano conversando detrás del bot, así que derivar
significa dejar el caso registrado para el equipo de Finet (o, sin RUT,
recomendar el WhatsApp) y dejar de responder.

1. El LLM decide cuándo derivar con la herramienta `derivar_a_persona`. Lo hace
   si el cliente pide hablar con una persona, o si acepta la derivación que el
   bot le ofreció porque no sabía responder. No se usan palabras clave porque
   lo habitual es que el cliente acepte con un "sí".
2. **Cliente identificado (CU-77):** el bot registra un ticket de soporte en
   finet-clientes (`POST /asistente/clientes/escalamientos`) con el RUT, el
   historial de la conversación (con el RUT como `[RUT]`) y un resumen que
   escribe el LLM en el parámetro `motivo` de la herramienta. Le responde:

   > Generé un reporte con el código FIN-2026-000123 para que una persona de
   > nuestro equipo te atienda. Te contactaremos a la brevedad. Desde aquí ya
   > no podré responder más mensajes en esta conversación.

   Ni el bot ni finet-clientes asignan operador: el ticket queda `ABIERTO`,
   con `origen: 'ASISTENTE'`, y lo asigna el CRM (G8 es dueño de los
   tickets). No pide sesión del portal (a diferencia del CU-66) porque lo abre
   el sistema y tiene que funcionar también por WhatsApp.

   **Si el ticket no se puede registrar** (excepción 1: finet-clientes caído,
   error, o más de 5 s) se le avisa que lo atenderán en breve, con el WhatsApp
   por si acaso:

   > Una persona de nuestro equipo te atenderá en breve. Si lo prefieres,
   > también puedes escribirnos por WhatsApp al +56 9 4500 2319. Desde aquí ya
   > no podré responder más mensajes en esta conversación.

   Si finet-clientes recibió la petición pero no pudo crear el ticket (lo
   habitual: falló la base de datos), además avisa por correo a los operadores
   de Soporte, o a `SOPORTE_EMAIL` si no encuentra ninguno, con el RUT y el
   historial, para que tomen el caso a mano. Si finet-clientes no respondió,
   no hay quien avise: el caso solo queda en el log del bot.

   **Cliente sin identificar:** no hay RUT al que vincular el ticket, así que
   el bot responde con un texto fijo que recomienda escribir por WhatsApp al
   `WHATSAPP_NUMBER`. Todos son textos fijos y no del LLM para que el número y
   el código no se puedan alterar.
3. Desde ahí, la conversación **no se responde ni se registra**: los mensajes
   no llegan al LLM, no se guardan en el historial, no se verifican RUTs y el
   log solo dice que se descartó un mensaje, sin su texto ni su largo.
4. Como esos mensajes no cuentan como actividad, a las 48 horas de la
   derivación la conversación se reinicia y el bot vuelve a atender desde el
   pedido de RUT. En el widget, "Nueva conversación" crea otra sesión y
   también vuelve a empezar.

## Si el LLM no responde (CU-65, excepción 1)

Si el LLM falla, responde vacío o no termina dentro de `REPLY_TIMEOUT_MS`
(45 s por defecto, para todo el turno: reintentos y la segunda llamada del
CU-64 incluidos), la conversación **se deriva** como en la sección anterior,
con un texto fijo:

> No pude responder en este momento. Una persona de nuestro equipo puede
> atenderte por WhatsApp al +56 9 4500 2319. Desde aquí ya no podré responder
> más mensajes en esta conversación.

Ese es el texto para un cliente sin identificar. A uno identificado se le
registra el ticket como en cualquier derivación (CU-77) y el texto es
"No pude responder en este momento." seguido del aviso del ticket (o de la
excepción 1). El tiempo del ticket (5 s) corre aparte, después del plazo del
LLM: 45 + 5 + 5 s de la verificación del RUT siguen bajo los 60 s que espera
finet-clientes.

Un error que no venga del LLM, como un bug, sigue respondiendo `500` y no
guarda nada.

## Conocimiento de Finet

En cada respuesta del LLM va, además del prompt, lo que Finet publica en su
sitio, para que responda las consultas generales sin inventar:

- **Datos fijos** ([src/knowledge/finet.texts.ts](src/knowledge/finet.texts.ts)):
  comunas con cobertura, qué se necesita para contratar, plazos de
  instalación, datos ilimitados, qué hacer ante una falla, cómo se paga y las
  páginas del sitio para cada tema. Son los de la página de ayuda de
  finet-clientes (`apps/view/app/ayuda/page.tsx`): si el sitio los cambia,
  hay que cambiarlos acá también.
- **Catálogo de planes**, leído del mismo endpoint público que usa la página
  de planes (`GET /landing/planes`): nombre, tipo, velocidad, precio y
  descripción. Se guarda 10 minutos; si finet-clientes no responde se sigue
  usando el último hasta por 24 horas. Sin catálogo, el LLM tiene prohibido
  dar planes o precios y envía a `SITE_URL/planes` o al WhatsApp.

Reglas que lleva el contexto:

- Precios, velocidades y planes, solo del catálogo. Promociones y descuentos
  no se confirman.
- **La cobertura no se confirma por dirección:** el mapa del sitio es una
  grilla de celdas de unos 220 m, no una consulta de factibilidad. El LLM
  nombra las comunas y envía al mapa (`SITE_URL/cobertura`) o al WhatsApp.
- Lo que no está (plazos de contrato, equipos, canales, horarios) se dice que
  no se sabe, con la página que corresponda o la oferta de derivar.

El catálogo se lee dentro del plazo del turno (`REPLY_TIMEOUT_MS`), con 3 s
como máximo.

## Cómo funciona

- **Un solo flujo para todos los canales.** `MessagesService` lee el historial,
  llama al LLM y guarda el turno. Cada conversación procesa sus mensajes de a
  uno, así dos mensajes seguidos no pisan el historial.
- **Historiales separados por canal.** La clave incluye el canal
  (`web:<sesión>`, `chatwoot:<cuenta>:<conversación>`, `api:…`), así que un
  canal no puede escribir en la conversación de otro.
- **Si el LLM falla, la conversación se deriva** (ver arriba). Cualquier otro
  error no guarda nada, así que reintentar no duplica el mensaje.
- **Privacidad en los logs.** Por defecto solo se registra el largo de cada
  mensaje, no su texto.

```
src/
├── chat/        cliente del LLM, prompt y almacén de conversaciones
├── config/      lectura de variables (vacía = ausente)
├── customers/   detección de RUT y llamadas a finet-clientes
├── knowledge/   datos de Finet y catálogo de planes para el contexto del LLM
└── messages/    controladores por canal, guards, MessagesService, herramientas y textos de cada CU
    ├── chatwoot/  webhook, firma, tipos y mapeo de Chatwoot
    └── web/       endpoint del widget
```

## Estado

Funciona:

- Widget del sitio, de punta a punta a través de finet-clientes.
- Consultas generales con los datos que publica Finet y su catálogo de
  planes vigente, sin inventar precios ni confirmar cobertura por dirección.
- Identificación por RUT al inicio de la conversación (CU-63), en todos los
  canales.
- Saldo y estado de las facturas del cliente identificado (CU-64).
- Reporte de fallas con solicitud de soporte, para el cliente identificado y
  con sesión en el sitio (CU-66).
- Recepción y validación del webhook de Chatwoot.
- Derivación a una persona: deja de responder esa conversación. Al cliente
  identificado le registra un ticket de soporte con el historial, que el
  equipo toma desde el CRM (CU-77); al resto le recomienda el WhatsApp de
  Finet. También cuando el LLM no responde a tiempo (CU-65, excepción 1).

Pendiente:

- **Responder en Chatwoot.** El bot genera la respuesta, pero no la publica en
  la conversación. Al hacerlo, conviene responder `200` al webhook de inmediato
  y procesar el mensaje después.
- **Historial persistente.** Hoy vive en memoria (20 turnos por conversación,
  hasta 1.000 conversaciones): se pierde al reiniciar y no se comparte entre
  instancias. La identificación del cliente se pierde con él, y tras un
  reinicio se vuelve a pedir el RUT.
- **Derivación con agentes reales.** Hoy derivar es dejar un ticket o
  recomendar WhatsApp; nadie retoma la conversación en el chat (CU-70). En
  Chatwoot, que puede ser el propio WhatsApp, lo correcto será asignar la
  conversación a un agente.

## Scripts

```bash
pnpm start:dev   # desarrollo con recarga
pnpm build       # compila a dist/
pnpm start:prod  # ejecuta dist/main
pnpm test        # tests unitarios
pnpm test:e2e    # tests end-to-end (sin red: el LLM y finet-clientes se reemplazan por dobles)
pnpm lint        # oxlint con reglas de tipos
pnpm format      # prettier
```
