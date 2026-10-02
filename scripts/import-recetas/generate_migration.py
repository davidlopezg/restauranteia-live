"""
Generador de migracion SQL a partir de recetas parseadas + catalogo actual.

Modos:
- offline (sin anon key): genera UPSERTs por titulo usando una CTE/INSERT.
  El SQL resultante es idempotente: si el plato ya existe, UPDATE; si no, INSERT.

- online (con anon key): descarga el catalogo actual de Supabase, hace
  matching por titulo normalizado, y emite UPDATE + INSERT separados.

Uso:
    python generate_migration.py                    # modo offline
    python generate_migration.py --use-supabase    # modo online (lee env)

Salida:
    scripts/import-recetas/output/migration.sql
    scripts/import-recetas/output/parsed/*.json   (uno por receta)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Permitir imports locales
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from parse_recipe import parse_md, Receta  # noqa: E402
from match_catalog import slug_from_filename, match_recipe_to_title, normalize  # noqa: E402


RECIPES_ROOT = HERE.parent.parent / ".scratch" / "recetas"  # cache local de .md
OUTPUT_DIR = HERE / "output"
PARSED_DIR = OUTPUT_DIR / "parsed"

# categorias por defecto segun subtipo
CATEGORIAS_POR_SUBTIPO = {
    "Pizza": ["Pizza"],
    "Postre": ["Postre"],
}


def jsonb_literal(d: dict) -> str:
    """Serializa un dict Python a literal jsonb valido en Postgres.

    Usa json.dumps (escape seguro). El caller envuelve con '...'::jsonb.
    """
    return json.dumps(d, ensure_ascii=False, separators=(",", ":"))


def parse_all_recipes(recipes_root: Path) -> list[tuple[Path, Receta]]:
    """Lee todos los .md de recipes_root y devuelve [(path, Receta)]."""
    out: list[tuple[Path, Receta]] = []
    for md in sorted(recipes_root.glob("*.md")):
        try:
            receta = parse_md(md)
            out.append((md, receta))
        except Exception as e:
            print(f"[WARN] No se pudo parsear {md.name}: {e}", file=sys.stderr)
    return out


def save_parsed(out_dir: Path, recetas: list[tuple[Path, Receta]]) -> None:
    """Guarda un .json por receta en out_dir."""
    from parse_recipe import receta_to_dict

    out_dir.mkdir(parents=True, exist_ok=True)
    for md, r in recetas:
        slug = slug_from_filename(md.name)
        target = out_dir / f"{slug}.json"
        target.write_text(
            json.dumps(receta_to_dict(r), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def fetch_catalog_supabase(url: str, anon_key: str) -> list[tuple[str, str]]:
    """Lee (id, titulo) de catalogos via PostgREST. Sin paginar (esperamos <200 items)."""
    try:
        import urllib.request
    except ImportError:
        raise RuntimeError("urllib no disponible")

    endpoint = f"{url.rstrip('/')}/rest/v1/catalogos?select=id,titulo"
    req = urllib.request.Request(
        endpoint,
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return [(row["id"], row["titulo"]) for row in data]


def slug_to_titulo(slug: str) -> str:
    """Para INSERT: convierte slug 'pizza_bcn' a titulo legible 'Pizza BCN'.

    Reglas: si empieza por 'pizza_' devuelve 'Pizza <resto>'.
    Para 'tarta_de_santiago' devuelve 'Tarta de Santiago'.
    Para 'mousse_limon' devuelve 'Mousse de Limon' (sin acentos -> con acentos es
    dificil sin un mapa; lo dejamos legible).
    """
    # Reemplazar _ por espacio y capitalizar
    parts = slug.replace("_", " ").strip().split()
    if not parts:
        return slug
    # Titulo = Title Case pero manteniendo particulas pequenas en minuscula
    small = {"de", "del", "la", "el", "y", "i"}
    out = []
    for i, p in enumerate(parts):
        if i > 0 and p in small:
            out.append(p)
        else:
            out.append(p.capitalize())
    return " ".join(out)


def build_sql_offline(recetas: list[tuple[Path, Receta]]) -> str:
    """Genera un .sql idempotente con UPSERTs por titulo normalizado."""
    from parse_recipe import receta_to_dict

    sqls: list[str] = [
        "-- Migracion: importar recetas de sol-de-nit-CORE/docs/Recetas/ a catalogos.receta_estructurada",
        "-- Generado automaticamente por scripts/import-recetas/generate_migration.py",
        "-- Idempotente: si el plato ya existe por titulo normalizado, UPDATE; si no, INSERT.",
        "-- EJECUTAR COMO ADMIN (SQL Editor o psql con rol que escriba en notion_migration).",
        "-- Esquema objetivo: notion_migration.catalogos (la tabla real; public.catalogos es solo vista de lectura).",
        "",
        "-- Helper: normaliza un titulo para matching (lowercase, sin acentos, sin prefijos)",
        "-- Equivalente al match_catalog.normalize() de Python.",
        "CREATE OR REPLACE FUNCTION notion_migration.normalize_title(s text) RETURNS text AS $$",
        "DECLARE",
        "    s2 text;",
        "BEGIN",
        "    s2 := lower(coalesce(s, ''));",
        "    -- Quitar acentos (descomponer NFD y descartar marcas)",
        "    s2 := translate(s2, 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC');",
        "    -- Quitar prefijos",
        "    WHILE s2 ~ '^(pizza|tarta|mousse|postre|escandallo|sop|poe)[ _]' LOOP",
        "        s2 := substring(s2 FROM '(?:pizza|tarta|mousse|postre|escandallo|sop|poe)[ _](.*)$');",
        "    END LOOP;",
        "    -- Quitar todo lo no alfanumerico",
        "    s2 := regexp_replace(s2, '[^a-z0-9]+', '', 'g');",
        "    RETURN s2;",
        "END;",
        "$$ LANGUAGE plpgsql IMMUTABLE;",
        "",
        "BEGIN;",
        "",
    ]
    for md, r in recetas:
        # Slug derivado del TITULO de la receta (no del nombre de archivo) para
        # que coincida con lo que devuelve notion_migration.normalize_title(titulo).
        slug = normalize(r.titulo)
        # Titulo del .md tal cual (ej "Pizza BCN", "Tarta de Santiago").
        # Si ya existe el plato (match por normalize_title) -> UPDATE.
        # Si NO existe -> INSERT con este titulo. Luego el usuario puede
        # renombrar en el panel si quiere ("Pizza BCN" -> "BCN").
        titulo_display = r.titulo
        d = receta_to_dict(r)
        json_literal = jsonb_literal(d)
        # categorias
        cats = CATEGORIAS_POR_SUBTIPO.get(r.subtipo, ["Otros"])
        cats_literal = "{" + ",".join(cats) + "}"
        # precio
        pvp = r.coste.pvp
        precio_sql = str(pvp) if pvp is not None else "NULL"

        sqls.append(f"-- {slug} -> '{titulo_display}' (subtipo={r.subtipo}, pvp={pvp})")
        sqls.append(
            f"""DO $$
DECLARE
    v_id uuid;
BEGIN
    SELECT id INTO v_id
    FROM notion_migration.catalogos
    WHERE notion_migration.normalize_title(titulo) = '{slug}'
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        UPDATE notion_migration.catalogos
        SET receta_estructurada = '{json_literal}'::jsonb
        WHERE id = v_id;
        RAISE NOTICE 'UPDATE %', v_id;
    ELSE
        INSERT INTO notion_migration.catalogos (titulo, precio, categorias, receta_estructurada, notion_id, migration_run_id)
        VALUES ('{titulo_display}', {precio_sql}, '{cats_literal}'::text[], '{json_literal}'::jsonb, gen_random_uuid(), 'import_recetas');
        RAISE NOTICE 'INSERT %', '{titulo_display}';
    END IF;
END $$;"""
        )
        sqls.append("")
    sqls.append("COMMIT;")
    sqls.append("")
    return "\n".join(sqls)


def build_sql_online(recetas: list[tuple[Path, Receta]], catalog: list[tuple[str, str]]) -> str:
    """Genera un .sql con UPDATEs para matches + INSERTs para no-matches."""
    from parse_recipe import receta_to_dict

    updates: list[str] = []
    inserts: list[str] = []
    unmatched: list[str] = []

    for md, r in recetas:
        slug = normalize(r.titulo)
        matched_id = match_recipe_to_title(slug, catalog)
        d = receta_to_dict(r)
        json_literal = jsonb_literal(d)
        if matched_id:
            updates.append(f"UPDATE notion_migration.catalogos SET receta_estructurada = '{json_literal}'::jsonb WHERE id = '{matched_id}';")
        else:
            unmatched.append(slug)
            titulo_display = r.titulo
            cats = CATEGORIAS_POR_SUBTIPO.get(r.subtipo, ["Otros"])
            cats_literal = "{" + ",".join(cats) + "}"
            pvp = r.coste.pvp
            precio_sql = str(pvp) if pvp is not None else "NULL"
            inserts.append(
                f"INSERT INTO notion_migration.catalogos (titulo, precio, categorias, receta_estructurada, notion_id, migration_run_id) "
                f"VALUES ('{titulo_display}', {precio_sql}, '{cats_literal}'::text[], '{json_literal}'::jsonb, gen_random_uuid(), 'import_recetas');"
            )

    out = [
        "-- Migracion: importar recetas de sol-de-nit-CORE/docs/Recetas/ a catalogos.receta_estructurada",
        "-- Modo ONLINE: matching contra el catalogo actual.",
        "-- Esquema objetivo: notion_migration.catalogos.",
        f"-- Catalogos existentes: {len(catalog)}",
        f"-- Recetas: {len(recetas)} -> {len(updates)} UPDATE, {len(inserts)} INSERT",
        "",
        "-- === No matches (titulo del archivo no encontrado en catalogo) ===",
        "-- " + ", ".join(unmatched) if unmatched else "",
        "",
        "BEGIN;",
        "",
        "-- === UPDATEs (platos existentes) ===",
        *updates,
        "",
        "-- === INSERTs (platos nuevos) ===",
        *inserts,
        "",
        "COMMIT;",
        "",
    ]
    return "\n".join(out)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--use-supabase", action="store_true", help="Leer catalogo actual de Supabase (requiere VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)")
    p.add_argument("--recipes-root", type=Path, default=RECIPES_ROOT, help="Directorio con .md de recetas")
    args = p.parse_args()

    if not args.recipes_root.exists():
        print(f"[ERROR] No existe {args.recipes_root}", file=sys.stderr)
        return 2

    recetas = parse_all_recipes(args.recipes_root)
    print(f"[OK] {len(recetas)} recetas parseadas")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    save_parsed(PARSED_DIR, recetas)
    print(f"[OK] JSONs guardados en {PARSED_DIR}")

    if args.use_supabase:
        url = os.environ.get("VITE_SUPABASE_URL")
        key = os.environ.get("VITE_SUPABASE_ANON_KEY")
        if not url or not key:
            print("[ERROR] --use-supabase requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en env", file=sys.stderr)
            return 2
        try:
            catalog = fetch_catalog_supabase(url, key)
            print(f"[OK] {len(catalog)} catalogos leidos de Supabase")
        except Exception as e:
            print(f"[ERROR] No se pudo leer Supabase: {e}", file=sys.stderr)
            return 2
        sql = build_sql_online(recetas, catalog)
    else:
        sql = build_sql_offline(recetas)

    target = OUTPUT_DIR / "migration.sql"
    target.write_text(sql, encoding="utf-8")
    print(f"[OK] Migracion SQL guardada en {target}")
    print(f"[OK] Total recipes: {len(recetas)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())