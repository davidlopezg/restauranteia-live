# Sol de Nit — Creativity Admin

Aplicación web interna para gestionar el sistema de creatividad de Sol de Nit
(Ideas, Agenda Creativa, Catálogo) leyendo datos reales de Supabase.

## Arquitectura

```
restauranteia-live/
├── admin-web/
│   └── backend/        # FastAPI (Python 3.11+) — sirve /api/* + /docs/* + frontend
└── admin-web-frontend/ # React 19 + TypeScript + Vite — se compila a dist/
```

**Stack:** FastAPI (backend) + React 19 / TS / Vite (frontend) + TanStack Query.

## Cómo correr

### Uso normal (un único comando, recomendado)

Desde la **raíz del repo**:

**Linux / Mac / WSL / Termux (móvil Android):**
```bash
./start.sh                  # si tiene permisos
bash start.sh               # alternativa universal si ./ falla
chmod +x start.sh && ./start.sh   # arregla permisos una vez
```

> 📱 **En Termux**: corré exactamente el mismo comando que en el PC.
> Termux trae `bash`, `node`, `npm` y `python` nativos, así que `bash start.sh`
> arranca el mismo servidor en `http://127.0.0.1:8765`. Si querés un atajo:
> `echo "alias arrancar='cd ~/repos/restauranteia-live && bash start.sh'" >> ~/.bashrc`

**Windows nativo (cmd / PowerShell):**
```bat
start.bat
```

Si da error `CreateProcessCommon:640` o similar: usa `bash start.sh` desde Git
Bash / WSL en vez de `./start.sh`. Es un problema de Windows intentando ejecutar
un script Unix directamente.

La primera vez tarda más (instala deps del frontend). Las siguientes, segundos.

Esto:
1. Si no existe `admin-web-frontend/dist/`, hace `npm install` + `npm run build`.
2. Arranca FastAPI en **http://127.0.0.1:8765**.
3. FastAPI sirve:
   - `/` → `admin-web-frontend/dist/index.html` (la SPA)
   - `/assets/*` → bundle JS/CSS generado por Vite
   - `/api/*` → routers FastAPI
   - `/docs/*` → documentación markdown (la sirve el repo, no el frontend)
   - Cualquier otra ruta → SPA fallback a `index.html` (React Router resuelve en cliente)

Abre **http://127.0.0.1:8765** y listo.

⚠️ **Si falla con "Sin conexión" en el sidebar:** falta `admin-web/backend/.env`.
Cópialo de `.env.example` y rellena las credenciales Supabase (ver más abajo).

### Desarrollo (HMR del frontend + backend separado)

Para iterar en el frontend con hot-reload:

```bash
# Terminal 1 — backend
cd admin-web/backend
python main.py                      # http://127.0.0.1:8765

# Terminal 2 — frontend con HMR
cd admin-web-frontend
npm run dev                         # http://localhost:5173
```

Vite está configurado con proxy `/api → 127.0.0.1:8765`, así que no hay CORS.
Los cambios en React se ven al instante; los del backend requieren reiniciar Python.

### Build manual del frontend

```bash
cd admin-web-frontend
npm run build       # genera dist/
npm run preview     # sirve dist/ estáticamente para probar el bundle
npm test            # 74 tests
npm run lint        # tsc --noEmit
```

## Estructura del backend

```
admin-web/backend/
├── main.py              # app factory + SPA fallback
├── routers/             # 5 routers: entities, desarrollo, images, ia, settings
├── queries.py           # SQL + lógica de negocio (sin ORM)
├── models.py            # Pydantic
├── config.py            # lee .env
├── ia_client.py         # cliente MiniMax
├── openrouter_client.py # cliente OpenRouter
└── supabase_client.py   # wrapper del Management API
```

55 rutas REST documentadas en `AUDITORIA_PRODUCTO.md`.

## Credenciales

Viven en `admin-web/backend/.env` (NUNCA en el frontend):

```ini
SUPABASE_URL=https://iprvxvsqpvsbvqbnfvly.supabase.co
SUPABASE_PROJECT_REF=iprvxvsqpvsbvqbnfvly
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SUPABASE_ACCESS_TOKEN=<management_api_personal_token>
```

Cómo obtenerlas:
- **Service role key**: Supabase Dashboard → Project → Settings → API → `service_role` (secret).
- **Management API token**: https://supabase.com/dashboard/account/tokens → `Generate new token`.

El frontend **nunca** recibe estas credenciales. Habla exclusivamente con el backend.

## Frontend — arquitectura interna

```
admin-web-frontend/src/
├── app/                       # QueryProvider, RouterProvider, Shell
├── features/                  # 1 carpeta por feature
│   ├── layout/                # sidebar + topbar + status pill + nav-config
│   ├── pipeline/              # ⭐ Kanban con DnD (@dnd-kit/react) + selector
│   ├── entities/              # CRUD genérico Ideas/Agendas/Catálogos
│   ├── blocks/                # renderer de bloques Notion (11 tipos)
│   ├── images/                # gallery + upload + zoom
│   ├── relations/             # panel N:M con añadir/quitar
│   ├── tests/                 # tests + feedback + ficha IA + evaluación 1
│   ├── dashboard/             # cadencia + pendientes
│   ├── ia/                    # ideas creativas + científicas
│   ├── settings/              # tema + IA keys + diagnóstico real
│   ├── documentation/         # markdown vivo desde /docs
│   └── search/                # overlay Cmd+K
├── services/                  # 9 servicios HTTP (entities, desarrollo, ia, ...)
├── types/                     # 13 archivos de tipos (Idea, Agenda, ...)
├── hooks/                     # use-breakpoint, use-clipboard, use-resize-observer
├── utils/                     # date, currency, cx, ...
├── providers/                 # theme-provider
└── styles/                    # globals.css + theme.css + typography.css
```

Stack: React 19.2, TypeScript 5.9, Vite 8, Tailwind 4, React Router 7, TanStack Query 5,
@dnd-kit/react 0.5, Vitest + RTL + MSW-ready.

## Documentación adicional

- `AUDIT_SUPABASE.md` — auditoría completa del schema Supabase.
- `AUDITORIA_PRODUCTO.md` — bugs del backend resueltos y deuda técnica restante.
- `admin-web-frontend/README.md` — detalles del starter Untitled UI base.

## Pendiente / siguiente

- Auth (Supabase Auth o API key) — bloqueante si la app se expone fuera de la LAN.
- Code-splitting del bundle (609 KB actual → ~300 KB inicial con lazy routes).
- Arreglar encoding_fix.py desde los datos fuente en lugar del parche runtime.
