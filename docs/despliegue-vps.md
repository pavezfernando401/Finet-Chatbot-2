# Despliegue en el VPS

Cómo poner finet-chatbot en producción en el mismo VPS donde corre el
backend de finet-clientes (`apps/controller`). Para qué sirve cada variable,
ver el [README](../README.md#configuración).

```
internet ──▶ sitio (Next.js) ──▶ controller :4000 ──127.0.0.1──▶ finet-chatbot :3001 ──▶ Groq
                                      ▲                                   │
                                      └────────── 127.0.0.1 ──────────────┘
                                  RUT, deuda, tickets y catálogo de planes
```

El bot escucha solo en `127.0.0.1`: lo llama únicamente el controller, que
está en la misma máquina, así que no se expone a internet ni necesita un
dominio, HTTPS ni una regla de firewall.

## 0. Antes de empezar

- **El controller en producción tiene que correr `main` con el PR #25
  mergeado.** Ahí vienen los endpoints que usa el bot (`/asistente/...` y
  `/landing/planes`). No hace falta aplicar migraciones: la base compartida
  ya tiene todo lo que ese código usa (revisado el 2026-11-04).
- Node.js 24 y pnpm en el VPS (`node -v`, `pnpm -v`). Si falta pnpm:
  `corepack enable pnpm`.
- Acceso de lectura al repo `invvd/finet-chatbot` desde el VPS (una deploy key
  de solo lectura en GitHub, o `gh auth login`).
- Una clave de Groq para producción, distinta de la de desarrollo.

### Averiguar cómo corren hoy los procesos

Hay que levantar el bot igual que el controller. En el VPS:

```bash
pm2 ls                                         # ¿aparece el controller? → PM2
systemctl list-units --type=service | grep -i -E "node|finet|controller"   # → systemd
docker ps                                      # → Docker
```

También anota **en qué puerto escucha el controller** (su `PORT`, 4000 por
defecto): va en `CLIENTES_API_URL`.

## 1. Instalar

Junto al controller, con el mismo usuario que lo corre (no root):

```bash
cd /opt                      # o donde esté finet-clientes
git clone git@github.com:invvd/finet-chatbot.git
cd finet-chatbot
pnpm install --frozen-lockfile
pnpm build
```

## 2. Configurar `.env`

```bash
cp .env.example .env
```

| Variable | Valor en producción |
|---|---|
| `HOST` | `127.0.0.1` |
| `PORT` | `3001` |
| `OPENAI_BASE_URL` / `OPENAI_MODEL` | Los del ejemplo (Groq, `openai/gpt-oss-120b`). |
| `OPENAI_API_KEY` | La clave de Groq de producción. |
| `API_KEY` | **Clave A**, nueva (ver abajo). |
| `CLIENTES_API_URL` | `http://127.0.0.1:<PORT del controller>/api` |
| `CLIENTES_API_KEY` | **Clave B**, nueva y distinta de la A. |
| `WHATSAPP_NUMBER` | El del ejemplo, si sigue siendo el de Finet. |
| `SITE_URL` | `https://finet.cl` (o el dominio real del sitio). |
| `CHATWOOT_WEBHOOK_SECRET` | Cualquier valor aleatorio: es obligatoria aunque Chatwoot no se use. |

No pongas `LOG_LEVEL=debug`: registraría el texto de los clientes.

Claves nuevas, **sin reutilizar las de desarrollo**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Protege el archivo: `chmod 600 .env`.

## 3. Configurar el controller

En el `apps/controller/.env` de producción de finet-clientes:

```env
CHATBOT_URL="http://127.0.0.1:3001"
CHATBOT_API_KEY="<clave A>"
ASISTENTE_API_KEY="<clave B>"
# Opcional: buzón de respaldo si una derivación no puede crear su ticket (CU-77).
SOPORTE_EMAIL="soporte@finet.cl"
```

Reinícialo como se reinicia siempre (`pm2 restart <nombre>`,
`sudo systemctl restart <servicio>`, …) para que tome las variables.

## 4. Arrancar el bot

Usa la misma herramienta que el controller.

**Con PM2:**

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save                     # para que vuelva tras un reinicio del VPS
```

**Con systemd:**

```bash
sudo cp deploy/finet-chatbot.service /etc/systemd/system/
sudo nano /etc/systemd/system/finet-chatbot.service   # User, WorkingDirectory y la ruta de `which node`
sudo systemctl daemon-reload
sudo systemctl enable --now finet-chatbot
```

**Una sola instancia, siempre.** Las conversaciones viven en la memoria del
proceso: con dos, una conversación saltaría entre ellas. No uses el modo
cluster de PM2.

## 5. Comprobar

En el VPS:

```bash
curl -s http://127.0.0.1:3001/health
# {"status":"ok"}

curl -s -X POST http://127.0.0.1:3001/web/messages \
  -H 'Content-Type: application/json' -H 'X-Api-Key: <clave A>' \
  -d '{"sessionId": "3f6c8a52-7d1e-4b9a-9c2f-5e8d1a0b7c64", "content": "hola"}'
# {"content":"¡Hola! Antes de seguir, ¿me indicas tu RUT? ...","handedOff":false}

curl -s -X POST http://127.0.0.1:<PORT del controller>/api/asistente/mensajes \
  -H 'Content-Type: application/json' \
  -d '{"id_sesion": "9b2e4c1a-5f3d-4e8b-a7c6-1d0f2e3b4a59", "mensaje": "hola"}'
# {"respuesta":"¡Hola! Antes de seguir, ...","derivado":false}
```

Desde fuera del VPS el puerto 3001 **no** debe responder.

En el sitio: abre el chat, escribe `hola`, luego un RUT real y
`¿qué planes tienen?`. El log del bot (`pm2 logs finet-chatbot` o
`journalctl -u finet-chatbot -f`) tiene que mostrar `RUT check: found`, y
ningún `Catalog refresh failed` ni `CLIENTES_API_URL or CLIENTES_API_KEY is
not set`.

Si algo falla, la tabla de [problemas frecuentes](puesta-en-marcha.md#problemas-frecuentes)
sirve igual en producción.

## Actualizar

```bash
cd /opt/finet-chatbot
git pull
pnpm install --frozen-lockfile
pnpm build
pm2 restart finet-chatbot          # o: sudo systemctl restart finet-chatbot
```

Cada reinicio borra las conversaciones en curso: a quien estaba chateando el
bot le vuelve a pedir el RUT. Conviene actualizar en un horario tranquilo.

## Volver a la versión anterior

```bash
git log --oneline -5               # elegir el commit anterior
git checkout <commit>
pnpm install --frozen-lockfile && pnpm build
pm2 restart finet-chatbot          # o: sudo systemctl restart finet-chatbot
```

Después, `git checkout main` para volver a seguir la rama.
