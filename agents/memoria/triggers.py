"""
agents/memoria/triggers.py — Heurística de detección automática de comentarios relevantes.

Cuando el usuario habla con el chef en modo chat, este módulo analiza el mensaje y
detecta "comentarios relevantes" —extractos que probablemente vale la pena recordar
(productos, elaboraciones, técnicas, herramientas, recetas, etc.).

Filosofía (Fase 4.1):
- Conservadora por defecto: preferible no detectar a guardar ruido.
- Tres niveles de confianza:
    ALTA  → guarda automático silencioso (origen='auto-chat')
    MEDIA → sugiere al usuario con un "💡 ¿Guardo esto?: [extracto]"
    BAJA  → no hace nada (pero queda en stats)
- Sin LLM para la clasificación (mantiene determinismo, sin coste extra).
- Categorización por keywords (ver agents/ideas_categorias.json, v2).

API pública:
    analizar_mensaje(mensaje: str) -> ResultadoAnalisis
    guardar_automatico(conn, mensaje, skill_origen=None) -> list[int]   # IDs guardados
    formatear_anexo_chat(resultado) -> str  # el 📌 discreto al final de la respuesta
"""

from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

# Configuración persistida (toggle on/off del usuario)
from agents.memoria.config import (
    is_memoria_activa,
    get_memoria_modo,  # 'alta' (auto-save) o 'sugerir' (pide confirmación)
)

# Storage
from agents.memoria.storage import (
    init_db,
    save_idea,
    check_duplicate,
    count_ideas,
)

# Categorías v2
_CATEGORIAS_PATH = Path(__file__).resolve().parent.parent / "ideas_categorias.json"
_CATEGORIAS_CACHE: Optional[dict[str, Any]] = None


# ── Tipos ────────────────────────────────────────────────────────────────────


@dataclass
class IdeaDetectada:
    """Una idea detectada en el mensaje del usuario."""

    extracto: str               # el fragmento concreto a guardar
    categoria: str              # categoría principal (producto/elaboracion/...)
    confianza: str              # "alta" | "media" | "baja"
    keywords_match: list[str] = field(default_factory=list)  # qué disparó la detección
    frase_intencion: Optional[str] = None  # la frase de intención que detectó (si hay)

    def to_dict(self) -> dict[str, Any]:
        return {
            "extracto": self.extracto,
            "categoria": self.categoria,
            "confianza": self.confianza,
            "keywords_match": self.keywords_match,
            "frase_intencion": self.frase_intencion,
        }


@dataclass
class ResultadoAnalisis:
    """Resultado de analizar un mensaje."""

    ideas: list[IdeaDetectada] = field(default_factory=list)
    mensaje_relevante: bool = False  # ¿hay alguna idea de cualquier nivel?
    tiempo_ms: float = 0.0

    @property
    def ideas_alta(self) -> list[IdeaDetectada]:
        return [i for i in self.ideas if i.confianza == "alta"]

    @property
    def ideas_media(self) -> list[IdeaDetectada]:
        return [i for i in self.ideas if i.confianza == "media"]

    def to_dict(self) -> dict[str, Any]:
        return {
            "mensaje_relevante": self.mensaje_relevante,
            "ideas": [i.to_dict() for i in self.ideas],
            "ideas_alta_count": len(self.ideas_alta),
            "ideas_media_count": len(self.ideas_media),
            "tiempo_ms": round(self.tiempo_ms, 2),
        }


# ── Carga de keywords ───────────────────────────────────────────────────────


def _load_categorias() -> dict[str, Any]:
    """Carga y cachea la taxonomía de categorías."""
    global _CATEGORIAS_CACHE
    if _CATEGORIAS_CACHE is None:
        with open(_CATEGORIAS_PATH, encoding="utf-8") as f:
            _CATEGORIAS_CACHE = json.load(f)
    return _CATEGORIAS_CACHE


def _invalidate_categorias_cache() -> None:
    """Invalida el caché de categorías (para tests)."""
    global _CATEGORIAS_CACHE
    _CATEGORIAS_CACHE = None


# ── Helpers ─────────────────────────────────────────────────────────────────


def _normalizar(texto: str) -> str:
    """Lowercase + colapsar espacios + quitar acentos para matching.

    Mantiene la ñ/Ñ (no las descompone en n + tilde). Esto es importante
    porque NFD descompone 'ñ' como 'n' + combining tilde, y luego no se
    puede distinguir de un carácter 'n' con tilde belonging a la letra
    anterior (ej: 'ón' = 'o' + 'n' + combining tilde).

    Estrategia:
    1. Reemplazar temporalmente ñ → ñ (placeholder) y Ñ → Ñ antes de NFD.
    2. Aplicar NFD y descartar todos los diacríticos (Mn).
    3. Restaurar ñ y Ñ.
    """
    import unicodedata

    texto = texto.lower().strip()
    texto = re.sub(r"\s+", " ", texto)

    # 1. Placeholder para ñ y mayúscula
    PLACEHOLDER_ENYE = "\u0001"  # carácter de control raro para no chocar
    texto_safe = texto.replace("ñ", PLACEHOLDER_ENYE)

    # 2. NFD + descartar diacríticos
    out_str = "".join(
        c for c in unicodedata.normalize("NFD", texto_safe)
        if unicodedata.category(c) != "Mn"
    )

    # 3. Restaurar ñ
    out_str = out_str.replace(PLACEHOLDER_ENYE, "ñ")
    return out_str


def _es_frase_cortesia(mensaje_norm: str) -> bool:
    """True si el mensaje es solo cortesía/pregunta meta/charla casual."""
    cats = _load_categorias()
    palabras_vacias = cats.get("palabras_vacias_contexto_no_relevante", {})

    # Match exacto en frases de cortesía
    for frase in palabras_vacias.get("frases_cortesia", []):
        if mensaje_norm == frase or mensaje_norm == frase + ".":
            return True

    # Mensajes muy cortos (< 4 chars después de normalizar) → no relevante
    if len(mensaje_norm) < 4:
        return True

    # Match en preguntas meta
    for frase in palabras_vacias.get("preguntas_meta", []):
        if frase in mensaje_norm:
            return True

    return False


def _match_intencion_alta(mensaje_norm: str) -> Optional[re.Match]:
    """Detecta frase de intención clara (alta confianza).

    Returns el match object si hay, None si no.
    """
    cats = _load_categorias()
    patrones = cats.get("patrones_intencion_alta_confianza", {}).get("frases_explicitas", [])
    for patron in patrones:
        m = re.match(patron, mensaje_norm, re.IGNORECASE)
        if m:
            return m
    return None


def _detectar_categorias(mensaje_norm: str) -> dict[str, dict[str, list[str]]]:
    """Detecta TODAS las categorías que aplican al mensaje.

    Returns: {categoria: {"especificos": [...], "patrones": [...]}}

    - "especificos": keywords sustantivos (ingredientes, platos, técnicas...).
      Determinan la categoría principal.
    - "patrones": frases-patrón genéricas (el, la, probar, hacer...).
      NO determinan categoría; solo afectan el score de confianza.
    """
    cats = _load_categorias()
    keywords_por_cat = cats.get("keywords", {})

    matches: dict[str, dict[str, list[str]]] = {}
    for categoria, config in keywords_por_cat.items():
        if categoria.startswith("_"):
            continue
        especificos: list[str] = []
        patrones: list[str] = []
        for key, value in config.items():
            if key.startswith("_"):
                continue
            if not isinstance(value, list):
                continue
            es_patron = key == "patrones_frase"
            for kw in value:
                kw_norm = _normalizar(kw)
                # Match con word boundary SIEMPRE para single-word keywords
                # para evitar falsos positivos (ej: 'menta' en 'fermentación',
                # 'bol' en 'boletus', 'pan' en 'panadero').
                # Para cubrir plurales, el JSON incluye ambos singular+plural
                # explícitamente (ej: 'trufa', 'trufas').
                matched = False
                if " " in kw_norm:
                    # Keyword multi-palabra: substring OK
                    if kw_norm in mensaje_norm:
                        matched = True
                else:
                    # Keyword de una palabra: word boundary estricto
                    if re.search(rf"\b{re.escape(kw_norm)}\b", mensaje_norm):
                        matched = True
                if matched:
                    if es_patron:
                        patrones.append(kw)
                    else:
                        especificos.append(kw)
        if especificos or patrones:
            matches[categoria] = {
                "especificos": especificos,
                "patrones": patrones,
            }

    return matches


def _extraer_extracto(mensaje: str, categoria: str, keywords: list[str]) -> str:
    """Extrae el fragmento concreto del mensaje que contiene la idea.

    Estrategia:
    - Si la frase es corta (< 120 chars), devuelve el mensaje entero limpio.
    - Si es larga, devuelve la oración (separada por . / , / ;) que contiene
      el primer keyword matcheado, con un poco de contexto (la oración completa).
    """
    mensaje = mensaje.strip()

    if len(mensaje) <= 120:
        # Mensaje corto → guardar entero
        # Pero quitar puntuación final redundante
        return mensaje.rstrip(". ").strip()

    # Mensaje largo → extraer la oración relevante
    # Dividir en oraciones (heurística: . ! ? ; seguido de espacio o fin)
    oraciones = re.split(r"(?<=[.!?;])\s+", mensaje)
    if not oraciones:
        return mensaje[:200].rstrip(". ").strip()

    # Buscar la oración que contenga el primer keyword
    keywords_norm = [_normalizar(k) for k in keywords]
    for oracion in oraciones:
        oracion_norm = _normalizar(oracion)
        if any(kw in oracion_norm for kw in keywords_norm):
            return oracion.strip().rstrip(". ").strip()

    # Si ninguna oración matchea (raro), devolver el mensaje entero truncado
    return mensaje[:200].rstrip(". ").strip()


def _resolver_categoria_principal(
    matches: dict[str, dict[str, list[str]]],
) -> Optional[str]:
    """Resuelve qué categoría es la 'principal' cuando hay varias.

    Solo cuenta los keywords ESPECÍFICOS (no los patrones_frase), porque los
    patrones genéricos ('el', 'la', 'probar') están en TODAS las categorías
    y no aportan información discriminante.

    Prioridad (de más específica a más genérica):
    receta > tecnica > herramienta > elaboracion > producto > evento >
    proveedor > cliente > restriccion > concepto
    """
    prioridad = [
        "receta", "producto", "herramienta", "tecnica", "elaboracion",
        "evento", "proveedor", "cliente", "restriccion", "concepto",
    ]
    for cat in prioridad:
        if cat in matches and matches[cat]["especificos"]:
            return cat
    return None


# ── Análisis principal ──────────────────────────────────────────────────────


def analizar_mensaje(mensaje: str) -> ResultadoAnalisis:
    """Analiza un mensaje del usuario y devuelve las ideas detectadas.

    Args:
        mensaje: El texto crudo del usuario (en el chat).

    Returns:
        ResultadoAnalisis con lista de IdeaDetectada y metadata.

    Nota: NO escribe en la DB. Solo detecta. Para guardar, llamar a
    ``guardar_automatico(conn, mensaje)``.
    """
    import time
    start = time.perf_counter()

    resultado = ResultadoAnalisis()
    if not mensaje or not mensaje.strip():
        return resultado

    mensaje_norm = _normalizar(mensaje)

    # Filtro 1: ¿es solo cortesía/charla? → no guardar nada
    if _es_frase_cortesia(mensaje_norm):
        resultado.tiempo_ms = (time.perf_counter() - start) * 1000
        return resultado

    # Detectar TODAS las categorías con sus keywords
    matches = _detectar_categorias(mensaje_norm)
    if not matches:
        # No hay ninguna keyword → no relevante
        resultado.tiempo_ms = (time.perf_counter() - start) * 1000
        return resultado

    # Detectar intención explícita (frases tipo "me gustaría probar X")
    intencion_match = _match_intencion_alta(mensaje_norm)
    frase_intencion = intencion_match.group(0) if intencion_match else None

    # Detectar intención simple (palabras como "probar", "usar", "hacer")
    _PATRONES_INTENCION_SIMPLE = [
        r"\bprobar\b", r"\busar\b", r"\bhacer\b", r"\btrabajar\b",
        r"\belaborar\b", r"\bpreparar\b", r"\bcocinar\b",
    ]
    tiene_intencion_simple = any(
        re.search(p, mensaje_norm) for p in _PATRONES_INTENCION_SIMPLE
    )

    # Resolver categoría principal (basado en específicos, no patrones)
    categoria_principal = _resolver_categoria_principal(matches)
    if categoria_principal is None:
        resultado.tiempo_ms = (time.perf_counter() - start) * 1000
        return resultado

    # Contar keywords específicos (los que importan para la categoría)
    n_especificos = len(matches[categoria_principal]["especificos"])
    n_patrones = len(matches[categoria_principal]["patrones"])
    n_categorias_con_especificos = sum(
        1 for m in matches.values() if m["especificos"]
    )
    keywords_principales = matches[categoria_principal]["especificos"] or \
        matches[categoria_principal]["patrones"]

    # Extraer el fragmento concreto
    extracto = _extraer_extracto(mensaje, categoria_principal, keywords_principales)

    # Determinar confianza
    if frase_intencion is not None and n_especificos >= 1:
        # Frase de intención fuerte + 1+ específico → ALTA
        confianza = "alta"
    elif n_especificos >= 2:
        # 2+ específicos en la misma categoría → ALTA (señal fuerte)
        confianza = "alta"
    elif n_especificos == 1 and tiene_intencion_simple:
        # 1 específico + palabra de intención simple → ALTA
        confianza = "alta"
    elif n_especificos == 1:
        # 1 específico sin intención → MEDIA (sugerir antes de guardar)
        confianza = "media"
    elif n_patrones >= 1:
        # Solo patrones sin específicos → BAJA (no guardar)
        confianza = "baja"
    else:
        confianza = "baja"

    if confianza == "alta" or confianza == "media":
        idea = IdeaDetectada(
            extracto=extracto,
            categoria=categoria_principal,
            confianza=confianza,
            keywords_match=keywords_principales,
            frase_intencion=frase_intencion,
        )
        resultado.ideas.append(idea)
        resultado.mensaje_relevante = True

    resultado.tiempo_ms = (time.perf_counter() - start) * 1000
    return resultado


# ── Guardado automático ─────────────────────────────────────────────────────


def guardar_automatico(
    conn: sqlite3.Connection,
    mensaje: str,
    skill_origen: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Analiza el mensaje y guarda las ideas de ALTA confianza automáticamente.

    Args:
        conn: Conexión SQLite abierta.
        mensaje: El mensaje del usuario.
        skill_origen: Skill activa cuando se detectó (chat, ficha, ideas_creativas...).

    Returns:
        Lista de dicts con info de cada idea guardada: {id, extracto, categoria}
        (vacía si no se guardó nada o si la memoria está desactivada).

    Comportamiento:
    - Si `is_memoria_activa()` es False → no hace nada.
    - Si `get_memoria_modo()` == 'alta' → guarda las ideas ALTA confianza.
    - Si `get_memoria_modo()` == 'sugerir' → no guarda nada (el caller debe
      mostrar las ideas de MEDIA confianza como sugerencia).
    - Deduplicación: si el extracto matchea una idea existente (exacta o fuzzy),
      NO la vuelve a guardar.
    - Marca cada idea guardada con `origen='auto-chat'`, `origen_skill=skill_origen`,
      y `contexto='[auto]'` para distinguirlas.
    """
    if not is_memoria_activa():
        return []

    if get_memoria_modo() != "alta":
        return []

    resultado = analizar_mensaje(mensaje)
    guardadas: list[dict[str, Any]] = []

    for idea in resultado.ideas_alta:
        # Comprobar duplicado antes de guardar
        dups = check_duplicate(conn, idea.extracto)
        if dups:
            continue  # ya existe, no duplicar

        try:
            idea_id = save_idea(
                conn,
                idea.extracto,
                categoria=idea.categoria,
                contexto="[auto]",
                origen="auto-chat",  # distingue del guardado manual ('comando')
                origen_skill=skill_origen,
            )
            guardadas.append({
                "id": idea_id,
                "extracto": idea.extracto,
                "categoria": idea.categoria,
            })
        except (ValueError, sqlite3.OperationalError):
            # Silencioso: si falla una, seguimos con las demás
            continue

    return guardadas


# ── Formato del anexo en chat ──────────────────────────────────────────────


def formatear_anexo_chat(
    guardadas: list[dict[str, Any]],
    resultado: Optional[ResultadoAnalisis] = None,
) -> str:
    """Genera el texto anexo al final de la respuesta del chef.

    - Si guardadas tiene elementos → línea discreta: '📌 2 ideas guardadas: #5, #8'
    - Si resultado tiene ideas_media y modo='sugerir' → '💡 ¿Guardo esto?: [extracto]'
    - Si nada → '' (cadena vacía, sin ruido)
    """
    partes: list[str] = []

    if guardadas:
        ids = ", ".join(f"#{g['id']}" for g in guardadas)
        n = len(guardadas)
        if n == 1:
            partes.append(f"📌 Guardé 1 idea en tu archivo: {ids}")
        else:
            partes.append(f"📌 Guardé {n} ideas en tu archivo: {ids}")

    # Si el modo es 'sugerir', mostramos las de MEDIA
    if resultado is not None and get_memoria_modo() == "sugerir":
        for idea in resultado.ideas_media:
            preview = idea.extracto[:80] + ("…" if len(idea.extracto) > 80 else "")
            partes.append(f"💡 ¿Guardo esto? ({idea.categoria}): {preview}")

    if not partes:
        return ""

    return "\n\n" + "\n".join(partes) + "\n\n*(esto es automático, `/memoria off` para desactivarlo)*"


# ── Helpers para los loops ─────────────────────────────────────────────────


def analizar_y_guardar(
    mensaje: str,
    skill_origen: Optional[str] = None,
    db_path: Optional[Path] = None,
) -> tuple[list[dict[str, Any]], ResultadoAnalisis]:
    """Convenience: analiza + guarda + devuelve resultado completo.

    Usado por los loops (CLI y UI). Abre y cierra la conexión.

    Args:
        mensaje: mensaje del usuario.
        skill_origen: skill activa (chat, ficha...).
        db_path: path custom de DB (para tests).

    Returns:
        Tupla (guardadas, resultado_analisis).
    """
    resultado = analizar_mensaje(mensaje)
    guardadas: list[dict[str, Any]] = []

    if not is_memoria_activa():
        return guardadas, resultado

    conn = init_db(db_path)
    try:
        guardadas = guardar_automatico(conn, mensaje, skill_origen=skill_origen)
    finally:
        conn.close()

    return guardadas, resultado


def estadisticas_triggers() -> dict[str, Any]:
    """Estadísticas de uso de la memoria automática (para /memoria-status)."""
    from agents.memoria.config import (
        get_memoria_modo,
        get_umbral_confianza,
    )
    cats = _load_categorias()
    return {
        "version_taxonomia": cats.get("version", 1),
        "categorias_disponibles": cats.get("categorias_principales", []),
        "memoria_activa": is_memoria_activa(),
        "modo": get_memoria_modo(),
        "umbral_confianza": get_umbral_confianza(),
    }


__all__ = [
    "IdeaDetectada",
    "ResultadoAnalisis",
    "analizar_mensaje",
    "guardar_automatico",
    "analizar_y_guardar",
    "formatear_anexo_chat",
    "estadisticas_triggers",
    "_invalidate_categorias_cache",  # para tests
    "_normalizar",  # para tests
]