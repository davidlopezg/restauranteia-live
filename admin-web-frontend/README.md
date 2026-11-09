# admin-web-frontend

Frontend React 19 + TypeScript + Vite del Sol de Nit Creativity Admin.

Construido sobre el starter oficial de Untitled UI Vite (`base: "./"` para que el
bundle funcione tanto desde Vite dev como desde FastAPI sirviendo `dist/`).

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173 (Vite + HMR)
                     # requiere backend en :8765 (Vite hace proxy /api)
npm test             # 74 tests con Vitest
npm run lint         # tsc --noEmit
```

## Build de producción

```bash
npm run build        # genera dist/ (609 KB · 184 KB gzip)
npm run preview      # sirve dist/ estáticamente para smoke-test
```

En uso normal no hace falta correr esto a mano: `./start.sh` desde la raíz del
repo hace el build automáticamente si `dist/` no existe y luego arranca FastAPI
que sirve el bundle + las rutas `/api/*`.

## Estructura

Ver `admin-web/README.md` para el árbol completo de `src/features/`.

## Fuente de verdad y Edge Functions

**La configuración de IA vive en la tabla `app_settings` de Supabase.** Las
Edge Functions son un proxy que la lee con `service_role`; nunca son la fuente
de verdad. Por eso:

- Guardar la API key funciona aunque las funciones NO estén desplegadas
  (PostgREST directo, `UPDATE` + `INSERT`).
- La página de Configuración y las de Ideas leen el mismo estado.

Si una Edge Function no está desplegada, el gateway de Supabase devuelve 404
**sin `content-type` en los headers CORS**, el preflight del navegador falla y
supabase-js lanza `Failed to send a request to the Edge Function` (sin código
HTTP). `src/services/edge-functions.ts` normaliza ese caso: la UI dice la
verdad ("las funciones no están desplegadas") en vez de "falta la API key".

### Desplegar las Edge Functions

Las despliegue el workflow **Deploy Frontend + Edge Functions**
(`.github/workflows/deploy-frontend.yml`). Necesita dos secrets del repo:

| Secret | Qué es |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | PAT de Supabase (*Account → Access Tokens*). **Si está caducado el job falla y no se despliega ninguna función.** |
| `SUPABASE_PROJECT_REF` | Ref del proyecto (p. ej. `iprvxvsqpvsbvqbnfvly`). |

```bash
gh secret set SUPABASE_ACCESS_TOKEN -R <owner>/<repo>
gh secret set SUPABASE_PROJECT_REF   -R <owner>/<repo>
```

Comprobar si están desplegadas:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<project-ref>.supabase.co/functions/v1/ia-status
# 404 = no desplegada · 401/405 = desplegada
```

## Stack

| Paquete | Versión |
|---|---|
| React | 19.2 |
| TypeScript | 5.9 |
| Vite | 8 |
| Tailwind CSS | 4 |
| React Router | 7 |
| TanStack Query | 5 |
| @dnd-kit/react | 0.5 (API nueva) |
| Untitled UI React | starter oficial |
| Vitest | 4 |
| React Testing Library | 16 |
