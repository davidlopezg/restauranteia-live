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
