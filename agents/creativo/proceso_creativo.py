"""
proceso_creativo.py — State machine del proceso creativo del chef.

Una sesión = UN proceso iterativo para UNA petición culinaria.
Trabaja fase por fase (7 fases). En cada turno el chef trabaja UNA fase.

Fases (en orden):
    1. alma         — El alma del plato
    2. metodos      — Métodos creativos que aplico
    3. equilibrio   — El equilibrio (dulce/salado/...)
    4. tecnica      — La técnica
    5. storytelling — El storytelling
    6. descartadas  — Cosas que consideré y descarté
    7. preguntas    — Cosas que me preocupan / preguntas al usuario

Comandos del usuario (vía input de chat):
    /estado          — ver en qué fase está
    /fase <N|nombre> — saltar a fase
    /volver          — rehacer la fase actual
    /ficha           — generar ficha final (requiere todas las fases o /ficha forzar)
    /reiniciar       — reset de todas las fases
    /salir           — terminar la sesión (la guarda)

El state machine persiste cada cambio en `conocimiento/interno_restaurante/sessions/`.
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv

from agents.creativo.sessions import (
    new_sesion_id,
    guardar_sesion,
    cargar_sesion,
    eliminar_sesion,
    listar_sesiones,
)

# Reusar la lógica base del agente (MiniMax call, idioma, etc.)
from agents.creativo.agent import (
    call_minimax,
    load_skill_prompt,
    check_estacionalidad,
    load_estacionalidad,
)

# Las fases del flujo se leen del .md (fuente de verdad, ver conocimiento/interno_app/procesos/proceso_creativo.md)
from agents.creativo.proceso_creativo_md import parse_proceso_creativo_md

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")


def _load_fases() -> list[dict]:
    """Lee las fases del .md del proceso creativo. Llamado al importar."""
    return parse_proceso_creativo_md()


# ══════════════════════════════════════════════════════════════════════════════
# Definición de las fases (leídas del .md al importar el módulo)
# ══════════════════════════════════════════════════════════════════════════════

try:
    FASES: list[dict] = _load_fases()
except (FileNotFoundError, ValueError) as e:
    # Fallar ruidosamente si el .md no se puede cargar — no tiene sentido
    # que el proceso creativo funcione sin su definición.
    raise ImportError(
        f"No se pudo cargar el flujo del proceso creativo desde el .md: {e}. "
        f"Verificá que existe conocimiento/interno_app/procesos/proceso_creativo.md "
        f"y respeta el formato esperado (bloques <!-- fase --> ... <!-- /fase -->)."
    ) from e

FASES_POR_KEY: dict[str, dict] = {f["key"]: f for f in FASES}


def _fase_index(key: str) -> int:
    """Devuelve el índice (0-based) de una fase por key. -1 si no existe."""
    for i, f in enumerate(FASES):
        if f["key"] == key:
            return i
    return -1


# ══════════════════════════════════════════════════════════════════════════════
# State machine
# ══════════════════════════════════════════════════════════════════════════════

class ProcesoCreativo:
    """
    Representa UNA sesión del proceso creativo.
    Se inicializa con petición + skill, y mantiene el state de las 7 fases.
    """

    def __init__(
        self,
        peticion: str,
        sesion_id: Optional[str] = None,
        cargar_de: Optional[str] = None,
    ):
        """
        Args:
            peticion: la petición culinaria del usuario.
            sesion_id: si se pasa, se crea con ese ID. Si no, se genera uno.
            cargar_de: si se pasa, se carga el state de esa sesión existente
                       (útil para reanudar).
        """
        if cargar_de:
            state = cargar_sesion(cargar_de)
            self._state = state
            self._es_nueva = False
        else:
            self._es_nueva = True
            self._state = self._state_inicial(peticion, sesion_id or new_sesion_id())

    @staticmethod
    def _state_inicial(peticion: str, sesion_id: str) -> dict:
        fases_iniciales = {}
        for f in FASES:
            fases_iniciales[f["key"]] = {
                "completa": False,
                "contenido": None,
                "intentos": 0,
            }
        ahora = datetime.now().astimezone().isoformat(timespec="seconds")
        return {
            "sesion_id": sesion_id,
            "peticion_inicial": peticion,
            "skill": "proceso_creativo",
            "created_at": ahora,
            "updated_at": ahora,
            "fase_actual": FASES[0]["key"],
            "fases": fases_iniciales,
            "ficha_final": None,
            "completa": False,
            "historial": [],  # lista de {timestamp, tipo, contenido}
        }

    # --- Acceso al state --------------------------------------------------

    @property
    def sesion_id(self) -> str:
        return self._state["sesion_id"]

    @property
    def peticion(self) -> str:
        return self._state["peticion_inicial"]

    @property
    def fase_actual_key(self) -> str:
        return self._state["fase_actual"]

    @property
    def fase_actual(self) -> dict:
        return FASES_POR_KEY[self.fase_actual_key]

    @property
    def completa(self) -> bool:
        return self._state["completa"]

    def fase(self, key: str) -> dict:
        """Devuelve el dict de una fase específica."""
        if key not in self._state["fases"]:
            raise KeyError(f"Fase '{key}' no existe. Válidas: {list(self._state['fases'].keys())}")
        return self._state["fases"][key]

    def todas_completas(self) -> bool:
        return all(f["completa"] for f in self._state["fases"].values())

    def fases_completadas(self) -> list[str]:
        return [k for k, f in self._state["fases"].items() if f["completa"]]

    def fases_pendientes(self) -> list[str]:
        return [k for k, f in self._state["fases"].items() if not f["completa"]]

    # --- Mutaciones del state ---------------------------------------------

    def save(self) -> Path:
        """Persiste el state a disco."""
        return guardar_sesion(self._state)

    def _registrar_evento(self, tipo: str, contenido: dict) -> None:
        self._state["historial"].append({
            "timestamp": datetime.now().astimezone().isoformat(timespec="seconds"),
            "tipo": tipo,
            **contenido,
        })

    def marcar_fase_completa(self, contenido: str) -> None:
        """Marca la fase actual como completa con el contenido dado, y avanza."""
        if not contenido or not contenido.strip():
            raise ValueError("El contenido de la fase no puede estar vacío")
        contenido = contenido.strip()

        key_actual = self.fase_actual_key
        self._state["fases"][key_actual]["completa"] = True
        self._state["fases"][key_actual]["contenido"] = contenido
        self._state["fases"][key_actual]["intentos"] += 1
        self._registrar_evento("fase_completada", {"fase": key_actual, "len": len(contenido)})

        # Avanzar a la siguiente fase pendiente
        idx_actual = _fase_index(key_actual)
        for i in range(idx_actual + 1, len(FASES)):
            prox_key = FASES[i]["key"]
            if not self._state["fases"][prox_key]["completa"]:
                self._state["fase_actual"] = prox_key
                self._registrar_evento("avance", {"de": key_actual, "a": prox_key})
                break
        else:
            # Llegamos al final y todas las anteriores están completas
            self._state["fase_actual"] = None  # sin fase activa
            self._state["completa"] = True
            self._registrar_evento("proceso_completo", {})

        self.save()

    def ir_a_fase(self, key: str) -> None:
        """Salta a una fase específica. NO marca nada como completa,
        solo cambia el foco. Si vas hacia atrás, regenera esa fase."""
        if key not in FASES_POR_KEY:
            raise KeyError(f"Fase '{key}' no existe. Válidas: {[f['key'] for f in FASES]}")
        if self._state["fase_actual"] == key:
            return  # ya estamos ahí
        anterior = self._state["fase_actual"]
        self._state["fase_actual"] = key
        self._state["completa"] = False
        self._registrar_evento("salto", {"de": anterior, "a": key})
        self.save()

    def regenerar_fase_actual(self) -> None:
        """Resetea la fase actual a no-completa (mantiene contenido anterior como referencia)."""
        key = self.fase_actual_key
        self._state["fases"][key]["completa"] = False
        self._state["completa"] = False
        self._registrar_evento("regenerar", {"fase": key})
        self.save()

    def reiniciar(self) -> None:
        """Resetea TODAS las fases (vuelve al inicio, mantiene peticion_inicial)."""
        for k in self._state["fases"]:
            self._state["fases"][k] = {"completa": False, "contenido": None, "intentos": 0}
        self._state["fase_actual"] = FASES[0]["key"]
        self._state["completa"] = False
        self._state["ficha_final"] = None
        self._registrar_evento("reinicio", {})
        self.save()

    def guardar_ficha_final(self, ficha: str) -> None:
        """Guarda la ficha final generada."""
        self._state["ficha_final"] = ficha
        self._registrar_evento("ficha_generada", {"len": len(ficha)})
        self.save()

    # --- Generación con LLM ----------------------------------------------

    def _armar_prompt_fase_actual(self) -> str:
        """Arma el user_message para el LLM enfocado en la fase actual."""
        from agents.creativo.agent import (
            formatear_catalogo_para_chef,
            formatear_restaurante_para_chef,
            load_catalogo,
            load_restaurante,
        )

        fase = self.fase_actual
        # Construir contexto de fases previas (solo las completas)
        contexto_previo = []
        for f in FASES:
            data = self._state["fases"][f["key"]]
            if data["completa"] and data["contenido"]:
                contexto_previo.append(
                    f"=== FASE {f['orden']}: {f['nombre']} ===\n{data['contenido']}"
                )
        contexto_str = (
            "\n\n".join(contexto_previo) if contexto_previo else "(sin fases previas)"
        )

        # Inyectar el contexto del restaurante y catálogo si existen
        restaurante_str = formatear_restaurante_para_chef(load_restaurante())
        catalogo_str = formatear_catalogo_para_chef(load_catalogo())

        system = (
            "Eres Chef Creativo Senior trabajando UNA fase del proceso creativo. "
            "Idioma: castellano. Solo el campo 'PROMPT PARA IMAGEN' puede ir en inglés al final.\n\n"
            f"PETICIÓN DEL USUARIO: {self.peticion}\n\n"
            f"FASE ACTUAL ({fase['orden']}/7): {fase['nombre']}\n"
            f"INSTRUCCIÓN PARA ESTA FASE: {fase['instruccion_llm']}\n\n"
            f"CONTEXTO DE FASES PREVIAS:\n{contexto_str}\n\n"
            f"REGLAS DURAS:\n"
            f"- Devolvé SOLO el contenido de esta fase.\n"
            f"- NO generes las otras fases.\n"
            f"- NO hagas la ficha final.\n"
            f"- 2-5 frases como máximo.\n"
            f"- Idioma: castellano. Sin caracteres cirílicos, hanzi, etc."
        )

        if catalogo_str:
            system = system + catalogo_str
        if restaurante_str:
            system = system + restaurante_str

        return system

    def trabajar_fase_actual(self) -> str:
        """
        Pide al LLM que trabaje la fase actual.
        Devuelve el contenido generado.
        NO marca como completa automáticamente — eso lo hace el orquestador
        cuando el usuario confirma.
        """
        prompt = self._armar_prompt_fase_actual()
        contenido = call_minimax(prompt, "Trabajá la fase actual según las instrucciones.")
        return contenido

    def generar_ficha_final(self, forzar: bool = False) -> str:
        """
        Si todas las fases están completas, pide al LLM la ficha final estructurada.
        Devuelve la ficha. Si forzar=True, genera aunque falten fases (con warning).
        """
        if not self.todas_completas() and not forzar:
            pendientes = self.fases_pendientes()
            raise ValueError(
                f"Faltan fases por completar: {pendientes}. "
                f"Usá /ficha forzar si querés generarla igual."
            )

        # Construir contexto con todas las fases
        fases_contenido = []
        for f in FASES:
            data = self._state["fases"][f["key"]]
            contenido = data["contenido"] or "(fase pendiente — sin contenido)"
            fases_contenido.append(
                f"=== {f['nombre']} ===\n{contenido}"
            )

        prompt_ficha = (
            "Eres Chef Creativo Senior. Generá la FICHA TÉCNICA FINAL del plato, "
            "usando como base el proceso creativo completo que ya está en tu memoria.\n\n"
            f"PETICIÓN: {self.peticion}\n\n"
            f"PROCESO CREATIVO:\n" + "\n\n".join(fases_contenido) + "\n\n"
        )
        # Inyectar el contexto del restaurante y catálogo si existen
        from agents.creativo.agent import (
            formatear_catalogo_para_chef,
            formatear_restaurante_para_chef,
            load_catalogo,
            load_restaurante,
        )
        catalogo_str = formatear_catalogo_para_chef(load_catalogo())
        restaurante_str = formatear_restaurante_para_chef(load_restaurante())
        if catalogo_str:
            prompt_ficha = prompt_ficha + catalogo_str + "\n\n"
        if restaurante_str:
            prompt_ficha = prompt_ficha + restaurante_str + "\n\n"

        prompt_ficha = prompt_ficha + (
            "Estructura obligatoria (sin omitir secciones):\n\n"
            "🍂 NOMBRE DEL PLATO\n"
            "[2-4 palabras evocadoras]\n\n"
            "📝 HISTORIA / STORYTELLING\n"
            "[2-4 frases]\n\n"
            "📋 FICHA TÉCNICA\n"
            "Ingredientes (para 4 raciones):\n"
            "- ...\n\n"
            "Elaboración (resumida):\n"
            "1. ...\n"
            "2. ...\n"
            "3. ...\n\n"
            "🍷 MARIDAJE SUGERIDO\n"
            "- Bebida: ...\n"
            "- Por qué: ...\n\n"
            "🎨 PROMPT PARA IMAGEN DEL PLATO\n"
            "[50-100 palabras en INGLÉS, para generadores de imagen]\n\n"
            "Reglas: castellano en todo menos el PROMPT PARA IMAGEN. "
            "Sin caracteres cirílicos, hanzi, etc."
        )
        ficha = call_minimax(prompt_ficha, "Generá la ficha final con la estructura indicada.")
        self.guardar_ficha_final(ficha)
        return ficha

    # --- Representación para UI ------------------------------------------

    def resumen_estado(self) -> str:
        """Devuelve un string con el estado actual, listo para mostrar al usuario."""
        lineas = []
        lineas.append(f"📋 Sesión: {self.sesion_id}")
        lineas.append(f"🍽️  Petición: {self.peticion}")
        lineas.append("")
        if self.fase_actual_key is None:
            lineas.append("Fase actual: — (proceso completo)")
        else:
            lineas.append(f"Fase actual: {self.fase_actual_key.upper()} — {self.fase_actual['nombre']}")
        lineas.append("")
        lineas.append("Progreso:")
        for f in FASES:
            data = self._state["fases"][f["key"]]
            if data["completa"]:
                icono = "✓"
            elif f["key"] == self.fase_actual_key:
                icono = "►"
            else:
                icono = "·"
            marcador = f" {icono} "
            lineas.append(f"  {marcador} {f['orden']}. {f['nombre']}")
        lineas.append("")
        if self._state["ficha_final"]:
            lineas.append("🍂 Ficha final: generada ✓")
        elif self.todas_completas():
            lineas.append("🍂 Ficha final: lista para generar (usá /ficha)")
        else:
            lineas.append(f"🍂 Ficha final: faltan {len(self.fases_pendientes())} fase(s)")
        return "\n".join(lineas)


# ══════════════════════════════════════════════════════════════════════════════
# Helpers de clase
# ══════════════════════════════════════════════════════════════════════════════

def listar_sesiones_activas() -> list[dict]:
    """Wrapper para listar sesiones guardadas."""
    return listar_sesiones()


def reanudar_sesion(sesion_id: str) -> ProcesoCreativo:
    """Carga una sesión existente por ID."""
    return ProcesoCreativo(peticion="", cargar_de=sesion_id)


def borrar_sesion(sesion_id: str) -> bool:
    """Borra una sesión por ID."""
    return eliminar_sesion(sesion_id)