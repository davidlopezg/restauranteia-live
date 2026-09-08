"""
Tests for agents.creativo.proceso_creativo_md — parser del .md del flujo.

Usa archivos .md en tmp_path para no depender del .md real.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from agents.creativo.proceso_creativo_md import (
    ProcesoCreativoMDError,
    parse_proceso_creativo_md,
)


# ── Helpers ──────────────────────────────────────────────────────────────


def _write_md(tmp_path: Path, content: str) -> Path:
    """Escribe un .md temporal y devuelve su path."""
    p = tmp_path / "proceso.md"
    p.write_text(content, encoding="utf-8")
    return p


def _minimal_md(*fases: str) -> str:
    """Genera un .md mínimo con las fases indicadas (key|instr)."""
    lines = ["# Proceso", "\n"]
    for i, (key, instr) in enumerate(fases, start=1):
        lines.append("<!-- fase -->")
        lines.append(f"orden: {i}")
        lines.append(f"key: {key}")
        lines.append(f"nombre: Nombre {key}")
        lines.append(f"descripcion_corta: Desc {key}")
        lines.append("instruccion_llm: |")
        # Indentar la instrucción con 2 espacios (como YAML)
        for instr_line in instr.split("\n"):
            lines.append(f"  {instr_line}")
        lines.append("<!-- /fase -->")
        lines.append("")
    return "\n".join(lines)


# ── Tests del .md real (integración) ─────────────────────────────────────


class TestRealMD:
    """Verifica que el .md real del repo se parsea correctamente."""

    def test_real_md_exists(self):
        from agents.creativo.proceso_creativo_md import DEFAULT_PROCESO_MD_PATH
        assert DEFAULT_PROCESO_MD_PATH.exists(), (
            f"Falta el .md del proceso creativo en {DEFAULT_PROCESO_MD_PATH}"
        )

    def test_real_md_parses_to_7_fases(self):
        fases = parse_proceso_creativo_md()
        assert len(fases) == 7

    def test_real_md_expected_keys(self):
        fases = parse_proceso_creativo_md()
        keys = [f["key"] for f in fases]
        assert keys == ["alma", "metodos", "equilibrio", "tecnica", "storytelling", "descartadas", "preguntas"]

    def test_real_md_orden_consecutivo(self):
        fases = parse_proceso_creativo_md()
        ordenes = [f["orden"] for f in fases]
        assert ordenes == [1, 2, 3, 4, 5, 6, 7]

    def test_real_md_required_fields(self):
        fases = parse_proceso_creativo_md()
        for f in fases:
            assert "key" in f
            assert "orden" in f
            assert "nombre" in f
            assert "instruccion_llm" in f
            assert isinstance(f["orden"], int)
            assert isinstance(f["instruccion_llm"], str)
            assert len(f["instruccion_llm"]) > 10, f"instruccion_llm demasiado corta en {f['key']}"

    def test_real_md_instructions_contain_keywords(self):
        """Sanity: las instrucciones reales mencionan palabras clave."""
        fases = parse_proceso_creativo_md()
        por_key = {f["key"]: f for f in fases}
        assert "ALMA" in por_key["alma"]["instruccion_llm"]
        assert "EQUILIBRIO" in por_key["equilibrio"]["instruccion_llm"]
        assert "TÉCNICA" in por_key["tecnica"]["instruccion_llm"]
        assert "STORYTELLING" in por_key["storytelling"]["instruccion_llm"]


# ── Tests del parser (con .md sintéticos) ────────────────────────────────


class TestParserBasics:

    def test_single_fase(self, tmp_path):
        md = _minimal_md(("alma", "Línea 1\nLínea 2"))
        path = _write_md(tmp_path, md)
        fases = parse_proceso_creativo_md(path)
        assert len(fases) == 1
        assert fases[0]["key"] == "alma"
        assert fases[0]["orden"] == 1
        assert fases[0]["nombre"] == "Nombre alma"
        assert fases[0]["instruccion_llm"] == "Línea 1\nLínea 2"

    def test_multiple_fases_ordered(self, tmp_path):
        md = _minimal_md(
            ("a", "instr a"),
            ("b", "instr b"),
            ("c", "instr c"),
        )
        path = _write_md(tmp_path, md)
        fases = parse_proceso_creativo_md(path)
        assert [f["key"] for f in fases] == ["a", "b", "c"]
        assert [f["orden"] for f in fases] == [1, 2, 3]

    def test_multilinea_preserva_saltos(self, tmp_path):
        md = _minimal_md(("alma", "Párrafo 1\n\nPárrafo 2\ncon dos líneas"))
        path = _write_md(tmp_path, md)
        fases = parse_proceso_creativo_md(path)
        assert "Párrafo 1" in fases[0]["instruccion_llm"]
        assert "Párrafo 2" in fases[0]["instruccion_llm"]

    def test_dedent_automatico(self, tmp_path):
        """La indentación común del bloque multilinea se quita (estilo YAML)."""
        md = _minimal_md(("alma", "primera línea\nsegunda línea"))
        path = _write_md(tmp_path, md)
        fases = parse_proceso_creativo_md(path)
        # Sin indentación al principio de cada línea
        assert not fases[0]["instruccion_llm"].startswith(" ")
        assert not "\n  " in fases[0]["instruccion_llm"]


class TestParserValidations:

    def test_no_blocks_raises(self, tmp_path):
        path = _write_md(tmp_path, "# Sin bloques\nSolo texto.")
        with pytest.raises(ProcesoCreativoMDError, match="No se encontraron bloques"):
            parse_proceso_creativo_md(path)

    def test_missing_required_field_raises(self, tmp_path):
        # Falta 'instruccion_llm'
        md = (
            "<!-- fase -->\n"
            "orden: 1\n"
            "key: alma\n"
            "nombre: El alma\n"
            "<!-- /fase -->"
        )
        path = _write_md(tmp_path, md)
        with pytest.raises(ProcesoCreativoMDError, match="instruccion_llm"):
            parse_proceso_creativo_md(path)

    def test_duplicate_key_raises(self, tmp_path):
        md = _minimal_md(
            ("alma", "x"),
            ("alma", "y"),  # duplicado
        )
        path = _write_md(tmp_path, md)
        with pytest.raises(ProcesoCreativoMDError, match="duplicado"):
            parse_proceso_creativo_md(path)

    def test_orden_must_be_int(self, tmp_path):
        md = (
            "<!-- fase -->\n"
            "orden: no_es_int\n"
            "key: alma\n"
            "nombre: X\n"
            "instruccion_llm: hola\n"
            "<!-- /fase -->"
        )
        path = _write_md(tmp_path, md)
        with pytest.raises(ProcesoCreativoMDError, match="orden"):
            parse_proceso_creativo_md(path)

    def test_orden_must_be_positive(self, tmp_path):
        md = (
            "<!-- fase -->\n"
            "orden: 0\n"
            "key: alma\n"
            "nombre: X\n"
            "instruccion_llm: hola\n"
            "<!-- /fase -->"
        )
        path = _write_md(tmp_path, md)
        with pytest.raises(ProcesoCreativoMDError, match="orden"):
            parse_proceso_creativo_md(path)

    def test_orden_no_consecutivo_raises(self, tmp_path):
        # orden 1 y orden 3 (falta el 2)
        md = (
            "<!-- fase -->\norden: 1\nkey: a\nnombre: A\ninstruccion_llm: x\n<!-- /fase -->\n"
            "<!-- fase -->\norden: 3\nkey: b\nnombre: B\ninstruccion_llm: y\n<!-- /fase -->"
        )
        path = _write_md(tmp_path, md)
        with pytest.raises(ProcesoCreativoMDError, match="consecutivos"):
            parse_proceso_creativo_md(path)


class TestParserErrors:

    def test_file_not_found(self, tmp_path):
        nonexistent = tmp_path / "no_existe.md"
        with pytest.raises(FileNotFoundError):
            parse_proceso_creativo_md(nonexistent)

    def test_invalid_syntax_in_block(self, tmp_path):
        # Bloque vacío
        md = "<!-- fase -->\n<!-- /fase -->"
        path = _write_md(tmp_path, md)
        with pytest.raises(ProcesoCreativoMDError):
            parse_proceso_creativo_md(path)


class TestParserTypes:

    def test_int_coercion(self, tmp_path):
        md = _minimal_md(("alma", "x"))
        path = _write_md(tmp_path, md)
        fases = parse_proceso_creativo_md(path)
        assert isinstance(fases[0]["orden"], int)
        assert fases[0]["orden"] == 1

    def test_descripcion_corta_optional(self, tmp_path):
        # Sin descripcion_corta: debe funcionar igual
        md = (
            "<!-- fase -->\n"
            "orden: 1\n"
            "key: alma\n"
            "nombre: X\n"
            "instruccion_llm: hola\n"
            "<!-- /fase -->"
        )
        path = _write_md(tmp_path, md)
        fases = parse_proceso_creativo_md(path)
        assert "descripcion_corta" not in fases[0]  # no está, no es error