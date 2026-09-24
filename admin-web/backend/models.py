"""
Modelos Pydantic para la API de Sol de Nit Creativity Admin.
Extraídos de main.py para reducir el tamaño del archivo principal.
"""
from pydantic import BaseModel


class IdeaCreate(BaseModel):
    titulo: str
    descripcion: str | None = None
    categorias: list[str] | None = None
    puntuacion: str | None = None
    estado_idea: str | None = None
    fecha_creacion: str | None = None


class IdeaUpdate(BaseModel):
    titulo: str | None = None
    descripcion: str | None = None
    categorias: list[str] | None = None
    puntuacion: str | None = None
    estado_idea: str | None = None
    fecha_creacion: str | None = None


class AgendaCreate(BaseModel):
    titulo: str
    fecha_creacion: str | None = None
    fecha: str | None = None
    etiquetas: list[str] | None = None


class AgendaUpdate(BaseModel):
    titulo: str | None = None
    fecha_creacion: str | None = None
    fecha: str | None = None
    etiquetas: list[str] | None = None
    estado_desarrollo: str | None = None
    objetivo: str | None = None
    receta_final: dict | None = None
    timeline: list | None = None


class CatalogoCreate(BaseModel):
    titulo: str
    orden: int | None = None
    precio: float | None = None
    anio: str | None = None
    estado: str | None = None
    categorias: list[str] | None = None
    seleccionada: bool | None = None
    ingredientes: str | None = None


class CatalogoUpdate(BaseModel):
    titulo: str | None = None
    orden: int | None = None
    precio: float | None = None
    anio: str | None = None
    estado: str | None = None
    categorias: list[str] | None = None
    seleccionada: bool | None = None
    ingredientes: str | None = None
    receta_estructurada: dict | None = None


class Relation(BaseModel):
    a_id: str
    b_id: str


class TestCreate(BaseModel):
    fecha: str | None = None
    estado: str = "PENDIENTE"
    objetivo: str | None = None
    receta_utilizada: str | None = None
    modificaciones: str | None = None
    resultado: str | None = None
    observaciones: str | None = None


class TestUpdate(BaseModel):
    fecha: str | None = None
    estado: str | None = None
    objetivo: str | None = None
    receta_utilizada: str | None = None
    modificaciones: str | None = None
    resultado: str | None = None
    observaciones: str | None = None


class FeedbackCreate(BaseModel):
    mesa: str
    num_personas: int | None = None
    valoracion: int | None = None
    criterio: str | None = None
    observacion: str | None = None
    fecha: str | None = None


class FeedbackUpdate(BaseModel):
    mesa: str | None = None
    num_personas: int | None = None
    valoracion: int | None = None
    criterio: str | None = None
    observacion: str | None = None
    fecha: str | None = None


class PlatingRegenerate(BaseModel):
    regenerate: bool = False


class WareRecommend(BaseModel):
    plating_proposal_id: str
