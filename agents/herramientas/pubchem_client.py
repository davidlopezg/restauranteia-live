"""
pubchem_client.py
==================

Cliente ligero para la API REST de PubChem (NIH).

¿Para qué?
-----------
PubChem expone ~100M de compuestos químicos con un endpoint REST estable
y gratuito. Lo usamos para:

1. Resolver un nombre de ingrediente → CID (Compound ID) y nombres IUPAC.
2. Obtener sinónimos y propiedades de un CID concreto.
3. Descubrir qué compuestos comparte un ingrediente (cuando no está en
   el mapping curado local).

Diseño mobile-first:
- Sin SDK pesado (sólo `httpx`, ya en requirements).
- Caché SQLite local — las respuestas cacheadas ocupan ~1 KB c/u.
- Rate-limit respetuoso: 5 req/s (límite oficial PubChem).
- Funciona offline si la respuesta está cacheada.

Rate limits oficiales (https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest):
- 5 requests/segundo.
- 400 requests/minuto.
- Sin clave de API necesaria.

Referencias:
- REST API: https://pubchem.ncbi.nlm.nih.gov/rest/pug/
- Tutorial: https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest-tutorial
"""

from __future__ import annotations

import json
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx

# ── Configuración ────────────────────────────────────────────────────────────

PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
REQUEST_TIMEOUT = 15.0  # segundos
MAX_RETRIES = 2
RATE_LIMIT_SLEEP = 0.25  # segundos entre requests (4 req/s, holgado bajo el límite de 5)

# Caché: vive en conocimiento/fuentes_externas/flavor_data/ (gitignored)
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = _PROJECT_ROOT / "conocimiento" / "fuentes_externas" / "flavor_data"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DB_PATH = CACHE_DIR / "pubchem_cache.db"


# ── Tipos públicos ───────────────────────────────────────────────────────────


@dataclass(frozen=True)
class PubchemCompound:
    """Información canónica de un compuesto en PubChem."""

    cid: int
    name: str  # nombre IUPAC o título PubChem
    molecular_formula: Optional[str] = None
    molecular_weight: Optional[float] = None
    synonyms: tuple[str, ...] = ()


# ── Caché SQLite ─────────────────────────────────────────────────────────────


def _init_cache(db_path: Path = CACHE_DB_PATH) -> sqlite3.Connection:
    """Inicializa la DB de caché. Idempotente."""
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS compound_cache (
            cache_key TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            fetched_at INTEGER NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_compound_cache_fetched ON compound_cache(fetched_at)"
    )
    conn.commit()
    return conn


def _cache_get(conn: sqlite3.Connection, key: str) -> Optional[dict]:
    row = conn.execute(
        "SELECT payload FROM compound_cache WHERE cache_key = ?", (key,)
    ).fetchone()
    if not row:
        return None
    return json.loads(row[0])


def _cache_put(conn: sqlite3.Connection, key: str, payload: dict) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO compound_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?)",
        (key, json.dumps(payload), int(time.time())),
    )
    conn.commit()


def _cache_stats(conn: sqlite3.Connection) -> dict:
    """Métricas del caché (para debug/diagnóstico)."""
    n_entries = conn.execute("SELECT COUNT(*) FROM compound_cache").fetchone()[0]
    size_bytes = conn.execute(
        "SELECT SUM(LENGTH(payload)) FROM compound_cache"
    ).fetchone()[0] or 0
    return {"entries": n_entries, "size_bytes": size_bytes}


# ── Helpers internos ─────────────────────────────────────────────────────────


def _normalize_name(name: str) -> str:
    """Normaliza un nombre de ingrediente para cache key estable."""
    return " ".join(name.strip().lower().split())


_last_request_at = 0.0


def _respect_rate_limit() -> None:
    """Espera lo necesario para no superar RATE_LIMIT_SLEEP entre llamadas."""
    global _last_request_at
    now = time.monotonic()
    elapsed = now - _last_request_at
    if elapsed < RATE_LIMIT_SLEEP:
        time.sleep(RATE_LIMIT_SLEEP - elapsed)
    _last_request_at = time.monotonic()


# ── API pública ──────────────────────────────────────────────────────────────


def search_compound_by_name(
    name: str,
    *,
    conn: Optional[sqlite3.Connection] = None,
) -> Optional[PubchemCompound]:
    """
    Busca un compuesto por nombre en PubChem y devuelve el primer match.

    Usa el endpoint /compound/name/{name}/property/... y resuelve también
    sinónimos vía /compound/name/{name}/synonyms/JSON.

    Args:
        name: nombre del ingrediente o compuesto (ej. "limonene", "ajo").
        conn: conexión SQLite opcional para caché. Si None, abre/cierra una.

    Returns:
        PubchemCompound si se encuentra, None si no hay match.
    """
    normalized = _normalize_name(name)
    cache_key = f"by_name:{normalized}"

    owned_conn = False
    if conn is None:
        conn = _init_cache()
        owned_conn = True

    try:
        cached = _cache_get(conn, cache_key)
        if cached:
            return PubchemCompound(
                cid=cached["cid"],
                name=cached["name"],
                molecular_formula=cached.get("molecular_formula"),
                molecular_weight=cached.get("molecular_weight"),
                synonyms=tuple(cached.get("synonyms", [])),
            )

        _respect_rate_limit()

        # 1. Resolver nombre → CID
        prop_url = f"{PUBCHEM_BASE}/compound/name/{normalized}/property/MolecularFormula,MolecularWeight,IUPACName/JSON"
        try:
            r = httpx.get(prop_url, timeout=REQUEST_TIMEOUT)
        except httpx.HTTPError:
            return None

        if r.status_code == 404:
            return None  # sin match — cachear negativo? No, son muchos falsos negativos.
        if r.status_code != 200:
            return None

        prop_table = r.json().get("PropertyTable", {})
        props = prop_table.get("Properties", [])
        if not props:
            return None
        first = props[0]
        cid = int(first["CID"])
        iupac = first.get("IUPACName") or first.get("Name") or name
        formula = first.get("MolecularFormula")
        weight = first.get("MolecularWeight")

        # 2. Sinónimos (best-effort, falla silenciosa)
        synonyms: list[str] = []
        try:
            _respect_rate_limit()
            syn_url = f"{PUBCHEM_BASE}/compound/name/{normalized}/synonyms/JSON"
            rs = httpx.get(syn_url, timeout=REQUEST_TIMEOUT)
            if rs.status_code == 200:
                info = rs.json().get("InformationList", {})
                info_items = info.get("Information", [])
                if info_items and "Synonym" in info_items[0]:
                    synonyms = info_items[0]["Synonym"][:10]  # cap a 10
        except (httpx.HTTPError, ValueError, KeyError):
            pass

        compound = PubchemCompound(
            cid=cid,
            name=iupac,
            molecular_formula=formula,
            molecular_weight=weight,
            synonyms=tuple(synonyms),
        )

        _cache_put(
            conn,
            cache_key,
            {
                "cid": compound.cid,
                "name": compound.name,
                "molecular_formula": compound.molecular_formula,
                "molecular_weight": compound.molecular_weight,
                "synonyms": list(compound.synonyms),
            },
        )
        return compound

    finally:
        if owned_conn:
            conn.close()


def get_compound_by_cid(
    cid: int,
    *,
    conn: Optional[sqlite3.Connection] = None,
) -> Optional[PubchemCompound]:
    """Lookup de un compuesto por CID (con caché)."""
    cache_key = f"by_cid:{cid}"
    owned_conn = False
    if conn is None:
        conn = _init_cache()
        owned_conn = True
    try:
        cached = _cache_get(conn, cache_key)
        if cached:
            return PubchemCompound(
                cid=cached["cid"],
                name=cached["name"],
                molecular_formula=cached.get("molecular_formula"),
                molecular_weight=cached.get("molecular_weight"),
                synonyms=tuple(cached.get("synonyms", [])),
            )

        _respect_rate_limit()
        url = f"{PUBCHEM_BASE}/compound/cid/{cid}/property/MolecularFormula,MolecularWeight,IUPACName/JSON"
        try:
            r = httpx.get(url, timeout=REQUEST_TIMEOUT)
        except httpx.HTTPError:
            return None
        if r.status_code != 200:
            return None
        props = r.json().get("PropertyTable", {}).get("Properties", [])
        if not props:
            return None
        first = props[0]
        compound = PubchemCompound(
            cid=cid,
            name=first.get("IUPACName") or first.get("Name") or f"CID {cid}",
            molecular_formula=first.get("MolecularFormula"),
            molecular_weight=first.get("MolecularWeight"),
            synonyms=(),
        )
        _cache_put(
            conn,
            cache_key,
            {
                "cid": compound.cid,
                "name": compound.name,
                "molecular_formula": compound.molecular_formula,
                "molecular_weight": compound.molecular_weight,
                "synonyms": [],
            },
        )
        return compound
    finally:
        if owned_conn:
            conn.close()


def cache_stats() -> dict:
    """Estadísticas del caché (útil para diagnóstico y reporting)."""
    conn = _init_cache()
    try:
        return _cache_stats(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    # Demo: buscar un par de compuestos para verificar que funciona.
    print("🔍 PubChem client — demo")
    print()
    for nombre in ["limonene", "allicin", "capsaicin", "eugenol"]:
        c = search_compound_by_name(nombre)
        if c:
            print(
                f"  {nombre} → CID {c.cid}: {c.name} ({c.molecular_formula}, "
                f"{c.molecular_weight} g/mol)"
            )
        else:
            print(f"  {nombre} → no encontrado")
    print()
    print("📦 Caché:", cache_stats())
