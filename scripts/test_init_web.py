"""
test_init_web.py
================

Tests de los helpers de init-web (Fase 2 producto vendible, PR 1).

Valida los 5 helpers nuevos en agents/knowledge_context.py:
  - cargar_restaurante_con_default()
  - cargar_catalogo_con_default()
  - guardar_con_backup()
  - guardar_catalogo_con_backup()
  - leer_con_backup_dir()

Cobertura:
 1. cargar_restaurante_con_default devuelve default si no existe
 2. cargar_restaurante_con_default devuelve dict real si existe
 3. cargar_catalogo_con_default devuelve default si no existe
 4. guardar_con_backup crea backup cuando ya existe el archivo
 5. guardar_con_backup NO crea backup cuando no existe
 6. guardar_con_backup sobrescribe correctamente
 7. guardar_catalogo_con_backup maneja backup + overwrite
 8. leer_con_backup_dir lista los backups en orden descendente

Sin red, sin API, sin Gradio instalado. Usa temp dirs aislados.

Uso:
    python scripts/test_init_web.py
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))


def check(label: str, ok: bool, detalle: str = "") -> bool:
    """Mini-helper para imprimir resultados. Devuelve True si pasó."""
    icon = "[PASS]" if ok else "[FAIL]"
    print(f"   {icon} {label}{(': ' + detalle) if detalle else ''}")
    return ok


def test_cargar_restaurante_con_default_sin_archivo() -> bool:
    """Check 1: cargar_restaurante_con_default devuelve default si no existe."""
    print("\n[1/8] cargar_restaurante_con_default (sin archivo)")
    with tempfile.TemporaryDirectory() as tmp:
        # Monkeypatch de los paths
        from agents import knowledge_context as kc
        original_kd = kc.KNOWLEDGE_DIR
        original_rp = kc.RESTAURANTE_PATH
        kc.KNOWLEDGE_DIR = Path(tmp)
        kc.RESTAURANTE_PATH = Path(tmp) / "restaurante.json"
        try:
            resultado = kc.cargar_restaurante_con_default({"demo": True, "nombre": "X"})
            ok_default = isinstance(resultado, dict) and resultado.get("demo") is True
            return check(
                "devuelve el default proporcionado",
                ok_default,
                f"resultado={resultado}",
            )
        finally:
            kc.KNOWLEDGE_DIR = original_kd
            kc.RESTAURANTE_PATH = original_rp


def test_cargar_restaurante_con_default_con_archivo() -> bool:
    """Check 2: cargar_restaurante_con_default devuelve dict real si existe."""
    print("\n[2/8] cargar_restaurante_con_default (con archivo)")
    with tempfile.TemporaryDirectory() as tmp:
        from agents import knowledge_context as kc
        original_kd = kc.KNOWLEDGE_DIR
        original_rp = kc.RESTAURANTE_PATH
        kc.KNOWLEDGE_DIR = Path(tmp)
        kc.RESTAURANTE_PATH = Path(tmp) / "restaurante.json"
        # Crear archivo
        data_real = {"demo": False, "nombre": "Restaurante Real", "precio_target_min": 30}
        kc.RESTAURANTE_PATH.write_text(
            json.dumps(data_real, ensure_ascii=False), encoding="utf-8"
        )
        try:
            resultado = kc.cargar_restaurante_con_default({"demo": True})
            ok_real = (
                resultado.get("nombre") == "Restaurante Real"
                and resultado.get("demo") is False
            )
            return check(
                "lee el archivo real (ignora el default)",
                ok_real,
                f"resultado={resultado}",
            )
        finally:
            kc.KNOWLEDGE_DIR = original_kd
            kc.RESTAURANTE_PATH = original_rp


def test_cargar_catalogo_con_default_sin_archivo() -> bool:
    """Check 3: cargar_catalogo_con_default devuelve default si no existe."""
    print("\n[3/8] cargar_catalogo_con_default (sin archivo)")
    with tempfile.TemporaryDirectory() as tmp:
        from agents import knowledge_context as kc
        original_kd = kc.KNOWLEDGE_DIR
        original_cp = kc.CATALOGO_PATH
        kc.KNOWLEDGE_DIR = Path(tmp)
        kc.CATALOGO_PATH = Path(tmp) / "catalogo_platos.json"
        try:
            default = [{"nombre": "Plato Test", "categoria": "entrante"}]
            resultado = kc.cargar_catalogo_con_default(default)
            ok = isinstance(resultado, list) and len(resultado) == 1
            return check(
                "devuelve el default (lista con 1 plato)",
                ok,
                f"len(resultado)={len(resultado)}",
            )
        finally:
            kc.KNOWLEDGE_DIR = original_kd
            kc.CATALOGO_PATH = original_cp


def test_guardar_con_backup_crea_backup() -> bool:
    """Check 4: guardar_con_backup crea backup cuando ya existe."""
    print("\n[4/8] guardar_con_backup crea backup si existe")
    with tempfile.TemporaryDirectory() as tmp:
        from agents import knowledge_context as kc
        original_kd = kc.KNOWLEDGE_DIR
        original_rp = kc.RESTAURANTE_PATH
        original_bd = kc.BACKUPS_DIR
        kc.KNOWLEDGE_DIR = Path(tmp)
        kc.RESTAURANTE_PATH = Path(tmp) / "restaurante.json"
        kc.BACKUPS_DIR = Path(tmp) / "backups"

        # Crear archivo inicial
        inicial = {"nombre": "v1"}
        kc.RESTAURANTE_PATH.write_text(
            json.dumps(inicial, ensure_ascii=False), encoding="utf-8"
        )

        try:
            # Guardar versión 2
            ok, msg = kc.guardar_con_backup({"nombre": "v2"})
            ok_saved = ok and kc.RESTAURANTE_PATH.exists()
            backups = list((Path(tmp) / "backups").glob("restaurante_*.json"))
            ok_backup = len(backups) == 1

            contenido_backup = json.loads(backups[0].read_text(encoding="utf-8"))
            ok_content = contenido_backup.get("nombre") == "v1"

            contenido_nuevo = json.loads(kc.RESTAURANTE_PATH.read_text(encoding="utf-8"))
            ok_new = contenido_nuevo.get("nombre") == "v2"

            return check(
                "backup creado + archivo sobrescrito",
                ok_saved and ok_backup and ok_content and ok_new,
                f"backups={len(backups)}, msg={msg!r}",
            )
        finally:
            kc.KNOWLEDGE_DIR = original_kd
            kc.RESTAURANTE_PATH = original_rp
            kc.BACKUPS_DIR = original_bd


def test_guardar_con_backup_sin_backup_si_no_existe() -> bool:
    """Check 5: guardar_con_backup NO crea backup cuando no existe."""
    print("\n[5/8] guardar_con_backup NO crea backup si no existe")
    with tempfile.TemporaryDirectory() as tmp:
        from agents import knowledge_context as kc
        original_kd = kc.KNOWLEDGE_DIR
        original_rp = kc.RESTAURANTE_PATH
        original_bd = kc.BACKUPS_DIR
        kc.KNOWLEDGE_DIR = Path(tmp)
        kc.RESTAURANTE_PATH = Path(tmp) / "restaurante.json"
        kc.BACKUPS_DIR = Path(tmp) / "backups"

        try:
            ok, msg = kc.guardar_con_backup({"nombre": "primera vez"})
            backups = list((Path(tmp) / "backups").glob("*.json")) if (Path(tmp) / "backups").exists() else []

            return check(
                "guarda OK + 0 backups",
                ok and len(backups) == 0,
                f"msg={msg!r}, backups={len(backups)}",
            )
        finally:
            kc.KNOWLEDGE_DIR = original_kd
            kc.RESTAURANTE_PATH = original_rp
            kc.BACKUPS_DIR = original_bd


def test_guardar_con_backup_idempotente() -> bool:
    """Check 6: guardar_con_backup sobrescribe correctamente."""
    print("\n[6/8] guardar_con_backup idempotencia")
    with tempfile.TemporaryDirectory() as tmp:
        from agents import knowledge_context as kc
        original_kd = kc.KNOWLEDGE_DIR
        original_rp = kc.RESTAURANTE_PATH
        original_bd = kc.BACKUPS_DIR
        kc.KNOWLEDGE_DIR = Path(tmp)
        kc.RESTAURANTE_PATH = Path(tmp) / "restaurante.json"
        kc.BACKUPS_DIR = Path(tmp) / "backups"

        try:
            # 3 guardados seguidos
            ok1, _ = kc.guardar_con_backup({"v": 1})
            ok2, _ = kc.guardar_con_backup({"v": 2})
            ok3, _ = kc.guardar_con_backup({"v": 3})

            contenido = json.loads(kc.RESTAURANTE_PATH.read_text(encoding="utf-8"))
            ok_content = contenido.get("v") == 3

            backups = list((Path(tmp) / "backups").glob("restaurante_*.json"))
            # Deben haber 2 backups (v1 y v2), no 3 (la v3 no genera backup porque es el archivo actual)
            ok_backups = len(backups) == 2

            return check(
                "3 guardados → archivo=v3, 2 backups",
                ok1 and ok2 and ok3 and ok_content and ok_backups,
                f"backups={len(backups)}",
            )
        finally:
            kc.KNOWLEDGE_DIR = original_kd
            kc.RESTAURANTE_PATH = original_rp
            kc.BACKUPS_DIR = original_bd


def test_guardar_catalogo_con_backup() -> bool:
    """Check 7: guardar_catalogo_con_backup maneja backup + overwrite."""
    print("\n[7/8] guardar_catalogo_con_backup")
    with tempfile.TemporaryDirectory() as tmp:
        from agents import knowledge_context as kc
        original_kd = kc.KNOWLEDGE_DIR
        original_cp = kc.CATALOGO_PATH
        original_bd = kc.BACKUPS_DIR
        kc.KNOWLEDGE_DIR = Path(tmp)
        kc.CATALOGO_PATH = Path(tmp) / "catalogo_platos.json"
        kc.BACKUPS_DIR = Path(tmp) / "backups"

        # Catálogo inicial
        inicial = [{"nombre": "Plato A", "precio": 10}]
        kc.CATALOGO_PATH.write_text(
            json.dumps(inicial, ensure_ascii=False), encoding="utf-8"
        )

        try:
            ok, msg = kc.guardar_catalogo_con_backup(
                [{"nombre": "Plato B", "precio": 20}]
            )
            contenido = json.loads(kc.CATALOGO_PATH.read_text(encoding="utf-8"))
            ok_content = contenido[0]["nombre"] == "Plato B"

            backups = list((Path(tmp) / "backups").glob("catalogo_platos_*.json"))
            ok_backup = len(backups) == 1

            return check(
                "catálogo sobrescrito + 1 backup",
                ok and ok_content and ok_backup,
                f"msg={msg!r}",
            )
        finally:
            kc.KNOWLEDGE_DIR = original_kd
            kc.CATALOGO_PATH = original_cp
            kc.BACKUPS_DIR = original_bd


def test_leer_con_backup_dir_ordenado() -> bool:
    """Check 8: leer_con_backup_dir lista en orden descendente (más reciente primero)."""
    print("\n[8/8] leer_con_backup_dir ordena por mtime DESC")
    with tempfile.TemporaryDirectory() as tmp:
        from agents import knowledge_context as kc
        import time
        original_bd = kc.BACKUPS_DIR
        kc.BACKUPS_DIR = Path(tmp) / "backups"
        kc.BACKUPS_DIR.mkdir(parents=True, exist_ok=True)

        try:
            # Crear 3 backups con timestamps distintos
            (kc.BACKUPS_DIR / "a_old.json").write_text("{}", encoding="utf-8")
            time.sleep(1.1)
            (kc.BACKUPS_DIR / "b_mid.json").write_text("{}", encoding="utf-8")
            time.sleep(1.1)
            (kc.BACKUPS_DIR / "c_new.json").write_text("{}", encoding="utf-8")

            resultado = kc.leer_con_backup_dir()
            nombres = [p.name for p in resultado]
            ok = (
                len(resultado) == 3
                and nombres[0] == "c_new.json"
                and nombres[1] == "b_mid.json"
                and nombres[2] == "a_old.json"
            )

            return check(
                "orden: c_new > b_mid > a_old",
                ok,
                f"orden={nombres}",
            )
        finally:
            kc.BACKUPS_DIR = original_bd


def main() -> int:
    print("=" * 60)
    print("🧪 Validación de helpers init-web (PR 1)")
    print("=" * 60)

    checks = [
        test_cargar_restaurante_con_default_sin_archivo(),
        test_cargar_restaurante_con_default_con_archivo(),
        test_cargar_catalogo_con_default_sin_archivo(),
        test_guardar_con_backup_crea_backup(),
        test_guardar_con_backup_sin_backup_si_no_existe(),
        test_guardar_con_backup_idempotente(),
        test_guardar_catalogo_con_backup(),
        test_leer_con_backup_dir_ordenado(),
    ]

    print("\n" + "=" * 60)
    passed = sum(checks)
    total = len(checks)
    if passed == total:
        print(f"🎉 {passed}/{total} checks pasaron.")
        print("=" * 60 + "\n")
        return 0
    else:
        print(f"⚠️  {passed}/{total} checks pasaron. Hay {total - passed} fallos.")
        print("=" * 60 + "\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
