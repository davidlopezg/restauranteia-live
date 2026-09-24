"""
Schemas Pydantic para validación de entrada/salida.

La API expone:
- GET /api/{entidad}?search=&categoria=&estado=&limit=&cursor=
- GET /api/{entidad}/{id}
- GET /api/{entidad}/{id}/blocks
- GET /api/{entidad}/{id}/images
- GET /api/{entidad}/{id}/relations
- POST /api/{entidad}
- PATCH /api/{entidad}/{id}
- DELETE /api/{entidad}/{id}
- POST /api/relations/{tabla}  body: {a_id, b_id}
- DELETE /api/relations/{tabla}?a_id=&b_id=
- GET /api/images/{entidad}/{id}/{image_id}  → devuelve signed URL temporal
"""
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field


# ---------- Input models ----------

class PaginationParams(BaseModel):
    search: Optional[str] = None
    categoria: Optional[str] = None
    estado: Optional[str] = None
    limit: int = Field(30, ge=1, le=200)
    cursor: Optional[str] = None  # id del último registro visto
    order: str = "fecha_creacion"  # columna por la que ordenar
    ascending: bool = False


class IdeaCreate(BaseModel):
    titulo: str
    descripcion: Optional[str] = None
    categorias: Optional[List[str]] = None
    puntuacion: Optional[str] = None
    estado_idea: Optional[str] = None
    fecha_creacion: Optional[str] = None  # ISO string


class IdeaUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    categorias: Optional[List[str]] = None
    puntuacion: Optional[str] = None
    estado_idea: Optional[str] = None
    fecha_creacion: Optional[str] = None


class AgendaCreate(BaseModel):
    titulo: str
    fecha: Optional[str] = None
    fecha_creacion: Optional[str] = None
    etiquetas: Optional[List[str]] = None


class AgendaUpdate(BaseModel):
    titulo: Optional[str] = None
    fecha: Optional[str] = None
    fecha_creacion: Optional[str] = None
    etiquetas: Optional[List[str]] = None


class CatalogoCreate(BaseModel):
    titulo: str
    orden: Optional[int] = None
    precio: Optional[float] = None
    anio: Optional[str] = None
    estado: Optional[str] = None
    categorias: Optional[List[str]] = None
    seleccionada: Optional[bool] = None
    ingredientes: Optional[str] = None


class CatalogoUpdate(BaseModel):
    titulo: Optional[str] = None
    orden: Optional[int] = None
    precio: Optional[float] = None
    anio: Optional[str] = None
    estado: Optional[str] = None
    categorias: Optional[List[str]] = None
    seleccionada: Optional[bool] = None
    ingredientes: Optional[str] = None


class RelationLink(BaseModel):
    a_id: str
    b_id: str


# ---------- Output models ----------

class ListResponse(BaseModel):
    items: List[Dict[str, Any]]
    next_cursor: Optional[str] = None
    total_in_page: int


class EntityDetail(BaseModel):
    item: Dict[str, Any]
    images: List[Dict[str, Any]]
    blocks: List[Dict[str, Any]]
    relations: Dict[str, List[Dict[str, Any]]]
