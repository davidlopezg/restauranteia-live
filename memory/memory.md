# Memoria de aprendizaje

## 2026-09-23

### Migración admin-web → React + TypeScript + Vite

**Estado**: auditoría completada, pendiente de ejecutar Fase 0 (verificación de init del CLI untitledui).

**Decisión clave**: David quiere migrar el frontend a React porque la versión vanilla JS tiene problemas estructurales (DOM imperativo, estado distribuido, drag&drop inconsistente, sin tipado, sin tests). El objetivo NO es "usar React" sino eliminar la fragilidad actual.

**Stack acordado** (mínimo, sin extras):
- React 19.2 + TypeScript 5.9 + Vite 8.x
- React Router 7 + TanStack Query 5
- @dnd-kit/react 0.5.x (API nueva, NO legacy)
- Untitled UI oficial (CLI `untitledui@0.1.65` con `init --vite`)
- Vitest + RTL + MSW

**Pipeline es crítico primero**. La nueva implementación usa dnd-kit con actualización optimista + PATCH al backend + rollback en caso de error. El frontend nunca decide si la transición es válida; el backend es autoridad (vía `queries.py:TRANSICIONES`).

**Reglas inquebrantables**:
1. No tocar backend ni modelo de datos.
2. Migración aislada en `admin-web-frontend/`, no tocar `admin-web/`.
3. Tests desde el principio para mutaciones críticas.
4. Reportar cada bloque con `IMPLEMENTADO / VERIFICADO / NO VERIFICADO / PENDIENTE`.
5. No añadir librerías no listadas.

**Precedente molesto para David**: @flipdish/ui-library fue descartado porque David quiere Untitled UI oficial, no derivados. Aprendió que la herramienta oficial es `untitledui` (CLI), NO `@untitledui/cli` (que era una conjetura mía basada en el CLI anterior / fork depeakworks que ahora apunta a untitledui.com).

**Lección**: David corrige sin drama cuando me equivoco en detalles técnicos. Hay que verificar contra npm registry antes de proponer paquetes, no asumir. Y cuando David da una URL exacta (ej. `npx untitledui@latest init <project> --vite`), seguirla literalmente.

### Documentación de la sesión
Archivo completo: `conversations/20260923-17-05-23-migracion-react-admin-web-decisiones.md`. Continuar mañana desde Fase 0 paso 1.
