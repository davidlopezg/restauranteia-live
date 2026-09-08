"""
Tests para agents.memoria.triggers — heurística de detección automática.

Cubre:
- Filtrado de cortesía/charla casual
- Detección de keywords por categoría (5 principales + auxiliares)
- Resolución de categoría principal en multi-categoría
- Niveles de confianza (alta/media/baja)
- Extracción del extracto relevante (no mensaje entero)
- Detección de intención explícita
- Patrones de frase vs keywords específicos
"""

from __future__ import annotations

from pathlib import Path

import pytest

from agents.memoria import triggers
from agents.memoria.triggers import (
    analizar_mensaje,
    IdeaDetectada,
    ResultadoAnalisis,
    _invalidate_categorias_cache,
    _normalizar,
)


@pytest.fixture(autouse=True)
def _fresh_cache():
    """Invalidar caché de categorías antes y después de cada test."""
    _invalidate_categorias_cache()
    yield
    _invalidate_categorias_cache()


# ── Test: filtrado de cortesía ─────────────────────────────────────────────


class TestCortesiaFilter:
    """Mensajes de cortesía / preguntas meta / charla casual no deben detectarse."""

    @pytest.mark.parametrize("msg", [
        "hola",
        "buenas",
        "buenos días",
        "buenas tardes",
        "qué tal",
        "como estás",
        "gracias",
        "muchas gracias",
        "ok",
        "vale",
        "perfecto",
        "de acuerdo",
        "qué puedes hacer",
        "qué comandos hay",
        "quién eres",
        "ayuda",
    ])
    def test_frases_cortesia_no_detectadas(self, msg: str):
        resultado = analizar_mensaje(msg)
        assert resultado.ideas == []
        assert resultado.mensaje_relevante is False

    @pytest.mark.parametrize("msg", ["", "  ", "a", "si", "no", "ya", "mm", "hmm"])
    def test_mensajes_muy_cortos_no_detectados(self, msg: str):
        resultado = analizar_mensaje(msg)
        assert resultado.ideas == []


# ── Test: detección de productos ────────────────────────────────────────────


class TestProductos:
    """Detección de productos / ingredientes."""

    def test_kumquat_producto_alta(self):
        resultado = analizar_mensaje("me gustaría probar el kumquat en el postre")
        assert len(resultado.ideas) == 1
        idea = resultado.ideas[0]
        assert idea.categoria == "producto"
        assert idea.confianza == "alta"
        assert "kumquat" in idea.extracto.lower()

    def test_trufa_producto_alta(self):
        resultado = analizar_mensaje("me gusta la trufa")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].categoria == "producto"
        assert resultado.ideas[0].confianza == "alta"

    def test_boletus_no_matchea_con_herramienta(self):
        """Regression: 'boletus' no debe matchear 'bol' de herramienta."""
        resultado = analizar_mensaje("quiero probar boletus")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].categoria == "producto"

    def test_queso_producto(self):
        resultado = analizar_mensaje("tengo que buscar un buen queso de cabra")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].categoria == "producto"


# ── Test: detección de elaboraciones ────────────────────────────────────────


class TestElaboraciones:
    """Detección de platos / preparaciones."""

    def test_risotto_elaboracion_alta(self):
        resultado = analizar_mensaje("me encantaría hacer un risotto de setas")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].categoria in ("elaboracion", "producto")
        assert resultado.ideas[0].confianza == "alta"

    def test_pizza_elaboracion(self):
        resultado = analizar_mensaje("tengo que hacer una pizza con masa madre")
        assert len(resultado.ideas) >= 1
        # Masa madre matchea producto (pan/bollería), pizza también.
        # Lo que importa es que detecte ALGO relevante.
        assert resultado.mensaje_relevante is True


# ── Test: detección de técnicas ────────────────────────────────────────────


class TestTecnicas:
    """Detección de métodos de cocina."""

    def test_sous_vide_tecnica(self):
        resultado = analizar_mensaje("probar sous-vide a 56 grados para el atún")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].confianza == "alta"

    def test_brasa_tecnica(self):
        resultado = analizar_mensaje("me gusta cocinar a la brasa en verano")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].categoria == "tecnica"
        assert resultado.ideas[0].confianza == "alta"

    def test_fermentacion_tecnica(self):
        resultado = analizar_mensaje("estoy probando fermentación de chucrut")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].categoria == "tecnica"


# ── Test: detección de herramientas ────────────────────────────────────────


class TestHerramientas:
    """Detección de aparatos, utensilios, equipo."""

    def test_thermomix_herramienta(self):
        resultado = analizar_mensaje("tengo que usar la thermomix nueva")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].categoria == "herramienta"
        assert resultado.ideas[0].confianza == "alta"

    def test_horno_herramienta(self):
        resultado = analizar_mensaje("me gusta el horno de leña")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].categoria == "herramienta"

    def test_mandolina_herramienta(self):
        resultado = analizar_mensaje("usar la mandolina para laminar")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].categoria == "herramienta"


# ── Test: detección de recetas ─────────────────────────────────────────────


class TestRecetas:
    """Detección de recetas completas."""

    def test_receta_gazpacho(self):
        resultado = analizar_mensaje("receta de mi gazpacho")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].categoria == "receta"
        assert resultado.ideas[0].confianza == "alta"

    def test_mi_receta(self):
        resultado = analizar_mensaje("receta de la tarta de la abuela")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].categoria == "receta"


# ── Test: detección de proveedores / clientes / eventos ───────────────────


class TestAuxiliares:
    """Detección de categorías auxiliares (proveedor, cliente, evento)."""

    def test_proveedor_basico(self):
        resultado = analizar_mensaje("tengo un proveedor nuevo de verduras")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].categoria == "proveedor"
        assert resultado.ideas[0].confianza == "alta"

    def test_cliente_alergia(self):
        resultado = analizar_mensaje("el cliente de la mesa 5 es celíaca")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].categoria == "cliente"

    def test_evento_menu_navideno(self):
        resultado = analizar_mensaje("menú de navidad")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].categoria == "evento"
        assert resultado.ideas[0].confianza == "alta"

    def test_restriccion_sin_gluten(self):
        resultado = analizar_mensaje("siempre hay que tener opciones sin gluten")
        assert len(resultado.ideas) == 1
        assert resultado.ideas[0].categoria == "restriccion"


# ── Test: no falsos positivos ──────────────────────────────────────────────


class TestNoFalsosPositivos:
    """Casos donde NO debe detectar nada."""

    @pytest.mark.parametrize("msg", [
        "me gusta el restaurante",
        "el cliente siempre tiene razón",
        "qué te parece si vamos al mercado",
        "el producto es bueno",
        "técnica: eso es muy complicado",
        "herramienta: hace falta tiempo",
        "tengo la thermomix",  # sin verbo de intención, es solo mención
    ])
    def test_solo_mencion_sin_intencion(self, msg: str):
        """Sin intención clara, no debe detectar (o solo MEDIA)."""
        resultado = analizar_mensaje(msg)
        # Aceptamos: nada detectado, o solo MEDIA (no ALTA)
        for idea in resultado.ideas:
            assert idea.confianza in ("baja", "media"), \
                f"Falso positivo ALTA en: {msg!r} → {idea.categoria}"


# ── Test: niveles de confianza ─────────────────────────────────────────────


class TestConfianza:
    """Verificar la lógica de los 3 niveles de confianza."""

    def test_alta_requiere_intencion_explicita(self):
        """ALTA = frase de intención fuerte ('me gustaría', 'tengo que') + específico."""
        r = analizar_mensaje("me gustaría probar el kumquat")
        assert r.ideas[0].confianza == "alta"

    def test_alta_por_multiples_especificos(self):
        """2+ específicos en la misma categoría → ALTA."""
        r = analizar_mensaje("me gusta el queso de cabra")
        # "queso" + "queso de cabra" en ingredientes_queso
        assert r.ideas[0].confianza == "alta"

    def test_alta_por_intencion_simple(self):
        """Palabra de intención simple ('probar') + 1 específico → ALTA."""
        r = analizar_mensaje("probar trufa")
        assert r.ideas[0].confianza == "alta"

    def test_media_solo_mencion(self):
        """Solo mención sin intención clara → MEDIA (sugerir)."""
        r = analizar_mensaje("kumquat")
        if r.ideas:
            assert r.ideas[0].confianza == "media"


# ── Test: extracción del extracto ──────────────────────────────────────────


class TestExtracto:
    """Verificar que se extrae el fragmento relevante, no el mensaje entero."""

    def test_mensaje_corto_extracto_completo(self):
        msg = "me gusta el kumquat"
        r = analizar_mensaje(msg)
        assert r.ideas[0].extracto == msg or r.ideas[0].extracto == msg.rstrip(". ")

    def test_mensaje_largo_extrae_oracion(self):
        msg = (
            "ayer fui al mercado y vi unas trufas buenísimas. "
            "también había boletus pero los dejé para la próxima. "
            "tengo que volver el viernes."
        )
        r = analizar_mensaje(msg)
        # Debe extraer la oración de la trufa, no todo el mensaje
        assert "trufa" in r.ideas[0].extracto.lower()
        assert len(r.ideas[0].extracto) < len(msg)


# ── Test: palabra boundary (no substring) ──────────────────────────────────


class TestWordBoundary:
    """Verificar que las palabras no matchean como substring."""

    def test_bol_no_matchea_boletus_en_herramienta(self):
        """'bol' (utensilio) no debe matchear dentro de 'boletus'."""
        r = analizar_mensaje("quiero probar boletus")
        # Solo debe detectar como producto
        assert r.ideas[0].categoria == "producto"

    def test_cazuela_no_matchea_en_cazuelas(self):
        """'cazuela' matchea como utensilio solo si está como palabra."""
        r = analizar_mensaje("me gusta la cazuela de barro")
        assert r.ideas[0].categoria == "herramienta"

    def test_pan_no_matchea_en_panadero(self):
        """'pan' (repostería) no debe matchear dentro de 'panadero'."""
        r = analizar_mensaje("conozco a un buen panadero")
        # No debe detectar nada (panadero no es palabra de panadería)
        for idea in r.ideas:
            assert idea.confianza != "alta"


# ── Test: tipos de retorno ─────────────────────────────────────────────────


class TestTipos:
    """Verificar que los tipos de retorno son correctos."""

    def test_idea_detectada_tiene_campos(self):
        r = analizar_mensaje("me gustaría probar el kumquat")
        idea = r.ideas[0]
        assert isinstance(idea, IdeaDetectada)
        assert isinstance(idea.extracto, str)
        assert isinstance(idea.categoria, str)
        assert idea.confianza in ("alta", "media", "baja")
        assert isinstance(idea.keywords_match, list)

    def test_resultado_to_dict(self):
        r = analizar_mensaje("me gustaría probar el kumquat")
        d = r.to_dict()
        assert "ideas" in d
        assert "ideas_alta_count" in d
        assert "ideas_media_count" in d
        assert "mensaje_relevante" in d
        assert "tiempo_ms" in d


# ── Test: normalización ────────────────────────────────────────────────────


class TestNormalizar:
    """Verificar el helper de normalización."""

    def test_minusculas(self):
        assert _normalizar("HOLA") == "hola"

    def test_espacios_colapsados(self):
        assert _normalizar("hola    mundo") == "hola mundo"

    def test_sin_acentos(self):
        assert _normalizar("año") == "año"  # ñ se mantiene, á → a
        assert _normalizar("está") == "esta"
        assert _normalizar("limón") == "limon"  # ó → o, la ñ aquí NO existe

    def test_conserve_enye(self):
        # 'piña' se queda como 'piña' (la ñ se mantiene)
        assert _normalizar("piña") == "piña"
        # 'ñ' suelta se mantiene
        assert _normalizar("ñ") == "ñ"
        # 'España' → 'españa' (la ñ se mantiene, la tilde de la 'á' se va)
        assert _normalizar("España") == "españa"