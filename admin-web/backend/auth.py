"""
Auth skeleton (NO ACTIVO por defecto).

Para activar Supabase Auth en el futuro:
1. En Supabase Dashboard → Authentication → Users: crear los usuarios.
2. En backend/.env añadir:
     AUTH_ENABLED=true
     AUTH_SUPABASE_URL=https://iprvxvsqpvsbvqbnfvly.supabase.co   # igual que SUPABASE_URL
     AUTH_AUDIENCE=authenticated                                 # o el audience que uses
3. En frontend/api.js: descomentar la línea que añade Authorization: Bearer <jwt>
   a todas las peticiones (ver comentario en api.js).
4. El middleware `auth_dependency()` ya está listo en main.py — basta con
   importar y aplicar a las rutas que quieras proteger.

Por ahora la app NO tiene auth y se considera "interna" (David lo confirmó
2026-09-22). El siguiente código está pensado para NO requerir reescritura
cuando se active.
"""
import os
import httpx

from config import config


AUTH_ENABLED = os.environ.get("AUTH_ENABLED", "false").lower() == "true"


async def verify_supabase_jwt(token: str) -> dict | None:
    """
    Valida un JWT contra Supabase Auth.
    Devuelve el payload si válido, None si no.
    Usa la JWKS publica de Supabase.
    """
    if not token:
        return None
    try:
        # Para simplificar, usamos el endpoint de "get user" con el JWT.
        # En produccion usar JWKS + validacion de firma + audience.
        r = httpx.get(
            f"{config.SUPABASE_URL}/auth/v1/user",
            headers={
                "apikey": config.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {token}",
            },
            timeout=10.0,
        )
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:
        return None


def auth_dependency():
    """
    FastAPI dependency factory. Uso:
        @app.get("/api/ideas", dependencies=[Depends(auth_dependency())])
    Devuelve 401 si AUTH_ENABLED=true y el token no es válido.
    Si AUTH_ENABLED=false, no hace nada.
    """
    if not AUTH_ENABLED:
        async def _noop():
            return None
        return _noop

    from fastapi import Header, HTTPException

    async def _dep(authorization: str | None = Header(None)):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, detail="Missing Bearer token")
        token = authorization.split(" ", 1)[1].strip()
        user = await verify_supabase_jwt(token)
        if not user:
            raise HTTPException(401, detail="Invalid token")
        return user

    return _dep
