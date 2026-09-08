# Archivo de Ideas — Schema

Base de datos local SQLite en `.agent_knowledge/ideas.db`.

## Tabla `ideas`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | ID autoincremental |
| `created_at` | TEXT (ISO 8601) | Fecha de creación (UTC) |
| `updated_at` | TEXT (ISO 8601) | Fecha de última modificación (UTC, NULL hasta primer edit) |
| `idea` | TEXT | Contenido de la idea (not null) |
| `categoria` | TEXT | Categoría (de `agents/ideas_categorias.json` o libre) |
| `contexto` | TEXT | Contexto adicional (skill + hash) |
| `confirmada_por_usuario` | INTEGER | Siempre 1 en v1 (el comando es el consentimiento) |
| `origen` | TEXT | 'comando' |
| `origen_skill` | TEXT | Skill activa al guardar ('ficha', 'ideas_creativas', 'proceso_creativo') |

## Índices

- `idx_ideas_created_at` ON `ideas(created_at)`
- `idx_ideas_categoria` ON `ideas(categoria)`
- `idx_ideas_origen_skill` ON `ideas(origen_skill)`

## Notas

- WAL mode para concurrencia segura en HF Space.
- v1 asume single-user. Si se expone a público, migrar a `ideas_<user_hash>.db`.
