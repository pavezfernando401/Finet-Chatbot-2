# Puesta en marcha del asistente (local)

Cómo levantar el chat del sitio completo en tu máquina: el widget de
finet-clientes, su backend y finet-chatbot. Para qué hace cada parte y cada
variable, ver el [README](../README.md).

## Qué se levanta

```
navegador :3000 ──▶ finet-clientes apps/controller :4000 ──CHATBOT_API_KEY──▶ finet-chatbot :3001 ──▶ LLM (Groq u otro)
  (widget)          POST /api/asistente/mensajes                              POST /web/messages
                                     ▲                                               │
                                     └────────────── ASISTENTE_API_KEY ──────────────┘
                              verifica el RUT y consulta la deuda en la base de finet-clientes
```

| Proceso | Repo | Puerto | Comando |
|---|---|---|---|
| Sitio (Next.js, trae el widget) | finet-clientes `apps/view` | 3000 | `pnpm dev:view` |
| Backend del sitio (NestJS) | finet-clientes `apps/controller` | 4000 | `pnpm dev:controller` |
| Asistente | finet-chatbot | 3001 | `pnpm start:dev` |

La base de datos es la misma que ya usa finet-clientes (`DATABASE_URL` en
`apps/controller/.env`). El chatbot no se conecta a ella: le pregunta al
controller.

## Requisitos

- Node.js 24 y pnpm.
- finet-clientes funcionando en local (su `.env` con `DATABASE_URL` y
  `JWT_SECRET`, ver su README).
- Una clave de un proveedor de LLM compatible con OpenAI y con *tool
  calling*. La más simple es Groq, que tiene plan gratuito: crear una en
  <https://console.groq.com/keys>. También sirve Ollama en local (ver
  [Otro proveedor de LLM](#otro-proveedor-de-llm)).

## 1. Configurar (una sola vez)

### finet-chatbot: `.env`

```bash
cp .env.example .env
```

Completar:

| Variable | Valor |
|---|---|
| `OPENAI_API_KEY` | Tu clave de Groq (`gsk_...`). |
| `API_KEY` | Una clave aleatoria (ver abajo). Es la **clave A**. |
| `CLIENTES_API_KEY` | Otra clave aleatoria, distinta. Es la **clave B**. |
| `CHATWOOT_WEBHOOK_SECRET` | Cualquier valor aleatorio. Es obligatoria aunque no uses Chatwoot. |

El resto ya trae el valor correcto para local (`PORT=3001`,
`CLIENTES_API_URL=http://localhost:4000/api`, `WHATSAPP_NUMBER`, el modelo de
Groq).

Para generar una clave:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### finet-clientes: `apps/controller/.env`

Agregar:

```env
CHATBOT_URL="http://localhost:3001"
CHATBOT_API_KEY="<clave A, igual a API_KEY del chatbot>"
ASISTENTE_API_KEY="<clave B, igual a CLIENTES_API_KEY del chatbot>"
```

Son dos claves, una por sentido, y cada una tiene que ser **idéntica** en los
dos archivos:

| Sentido | finet-clientes | finet-chatbot |
|---|---|---|
| El sitio le habla al chatbot | `CHATBOT_API_KEY` | `API_KEY` |
| El chatbot le habla al sitio | `ASISTENTE_API_KEY` | `CLIENTES_API_KEY` |

`apps/view` no necesita nada nuevo: el widget habla con el controller por
`NEXT_PUBLIC_API_URL`, que por defecto es `http://localhost:4000/api`.

## 2. Arrancar

Tres terminales. El orden no importa, pero así los logs de arranque quedan a
la vista:

```bash
# Terminal 1 — finet-chatbot
pnpm install        # la primera vez
pnpm start:dev

# Terminal 2 — finet-clientes
pnpm install        # la primera vez
pnpm dev:controller

# Terminal 3 — finet-clientes
pnpm dev:view
```

`pnpm dev` en la raíz de finet-clientes levanta controller y view juntos, con
los logs mezclados.

## 3. Comprobar que funciona

**Logs de arranque del chatbot.** Tiene que aparecer
`Engine at https://api.groq.com/openai/v1` y
`Nest application successfully started`. Si aparece
`CLIENTES_API_URL or CLIENTES_API_KEY is not set`, falta la clave B y nadie
podrá identificarse por RUT.

**El chatbot solo** (cambiar `<clave A>`):

```bash
curl -X POST http://localhost:3001/web/messages \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: <clave A>' \
  -d '{"sessionId": "3f6c8a52-7d1e-4b9a-9c2f-5e8d1a0b7c64", "content": "hola"}'
```

Responde `201` con el pedido de RUT: `{"content":"¡Hola! Antes de seguir, ¿me indicas tu RUT? ...","handedOff":false}`.

**A través del sitio** (sin clave, como el navegador):

```bash
curl -X POST http://localhost:4000/api/asistente/mensajes \
  -H 'Content-Type: application/json' \
  -d '{"id_sesion": "9b2e4c1a-5f3d-4e8b-a7c6-1d0f2e3b4a59", "mensaje": "hola"}'
```

Responde `200` con `{"respuesta":"¡Hola! Antes de seguir, ...","derivado":false}`.

**En el navegador.** Abrir <http://localhost:3000>: el botón del chat está
abajo a la derecha, en todas las páginas. Una conversación que recorre todo:

1. `hola` → pide el RUT.
2. El RUT de un cliente que exista en la base → responde a lo que quedó
   pendiente, ya sabiendo su nombre y sus planes.
3. `¿cuánto debo?` → saldo y facturas pendientes (CU-64).
4. `quiero hablar con una persona` → recomienda el WhatsApp y la conversación
   termina. El botón "Iniciar nueva conversación" empieza otra.

El log del chatbot muestra cada paso sin el texto del cliente:
`RUT check: found`, `account lookup: found`, `handed off, message dropped`.
Con `LOG_LEVEL=debug` en su `.env` también registra los mensajes.

## Problemas frecuentes

| Síntoma | Causa probable | Qué revisar |
|---|---|---|
| El chatbot no arranca: `Missing configuration: X is not set` | Falta esa variable o está vacía | `.env` del chatbot |
| El widget responde "No pude responder en este momento…" al primer mensaje | El controller no llegó al chatbot y respondió 503 | Log del controller, `No se pudo consultar al chatbot: …`: `fetch failed` es el chatbot apagado o `CHATBOT_URL` mal; `respondio 401`, clave A distinta en los dos lados; `respondio 404`, falta `API_KEY` en el chatbot. `CHATBOT_URL o CHATBOT_API_KEY no estan configurados` es lo que dice |
| El chatbot contesta, pero cada respuesta del LLM termina en "No pude responder en este momento…" | El LLM falla (CU-65, excepción 1) | Log del chatbot, `Engine call failed: …`: `401`, clave del proveedor; `404`, modelo inexistente; el modelo tiene que soportar *tool calling* |
| Siempre dice "No pude verificar tu identidad" | Log del chatbot `RUT check: unavailable` | Controller apagado, `CLIENTES_API_URL` sin el `/api` final, o clave B distinta (`finet-clientes answered 401`) |
| Lo mismo, con `RUT check: not_found` | Ese RUT no está en la tabla `cliente` | Probar con uno que exista en la base que usa el controller |
| "Estás enviando mensajes muy seguido" | Límite del widget: 10 mensajes por minuto por IP | Esperar un minuto |
| Tras reiniciar el chatbot vuelve a pedir el RUT | El historial vive en memoria y se pierde al reiniciar | Esperado. `start:dev` reinicia en cada cambio de código |
| `EADDRINUSE` | El puerto está ocupado | Cambiar `PORT` y la URL que apunta a él (`CHATBOT_URL` o `CLIENTES_API_URL`) |

## Otro proveedor de LLM

Cambiar de proveedor son tres líneas del `.env` del chatbot. Para trabajar
sin internet ni cuota, con Ollama:

```env
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=qwen2.5:7b
```

El modelo tiene que soportar *tool calling* (`qwen2.5`, `llama3.1`); sin él
el bot no puede derivar ni consultar la deuda. Un modelo local puede tardar
más que los 45 s de `REPLY_TIMEOUT_MS`: si pasa, el bot deriva a WhatsApp.

## Pruebas sin levantar nada

Ninguna necesita red, LLM ni base de datos:

```bash
# finet-chatbot
pnpm test && pnpm test:e2e && pnpm lint

# finet-clientes
pnpm -C apps/controller test
pnpm -C apps/view test
```

## Fuera de local

Lo mismo con otras URLs y claves nuevas, sin reutilizar las de desarrollo:

- `CHATBOT_URL` apunta a donde quede el chatbot. Conviene que no sea
  accesible desde internet: solo lo llama el controller. En la misma máquina
  que el controller, `HOST=127.0.0.1` en el `.env` del chatbot y
  `CHATBOT_URL="http://127.0.0.1:3001"` en el del controller.
- `GET /health` responde `{"status":"ok"}` mientras el proceso esté arriba.
- `CLIENTES_API_URL` apunta al controller, con `/api`.
- **Una sola instancia del chatbot.** El historial y la identificación viven
  en la memoria del proceso; con dos instancias, una conversación saltaría
  entre ellas.
- `REPLY_TIMEOUT_MS` debe quedar bajo los 60 s que espera el controller,
  menos 5 s de la verificación de RUT.

- `SITE_URL` es el sitio público al que el asistente envía a los clientes;
  por defecto `https://finet.cl`.

Lo que sigue pendiente está en el [Estado del README](../README.md#estado).
Lo principal: el historial vive en memoria, así que cada reinicio (un deploy,
por ejemplo) corta las conversaciones en curso y el bot vuelve a pedir el RUT.
