"""
Dependências FastAPI compartilhadas entre os routers do SISGEO.

Disponibiliza as principais guards de autenticação e utilitários de request
que são injetados via ``Depends()``.
"""

import logging
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.enums import PerfilEnum
from app.models.user import Usuario
from app.utils.security import decode_access_token

logger = logging.getLogger(__name__)

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Usuario:
    """Extrai e valida o usuário autenticado a partir do Bearer Token.

    Decodifica o JWT, busca o usuário no banco e garante que está ativo.

    Args:
        credentials: Cabeçalho ``Authorization: Bearer <token>``.
        db:          Sessão assíncrona do banco de dados.

    Returns:
        Instância :class:`~app.models.user.Usuario` autenticada.

    Raises:
        HTTPException 401: Token inválido, expirado ou usuário inativo.
    """
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")

    user_id: int | None = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido")

    user = await db.get(Usuario, user_id)
    if not user or not user.ativo:
        logger.warning("get_current_user: usuário inativo ou não encontrado → id=%s", user_id)
        raise HTTPException(status_code=401, detail="Usuário inativo ou não encontrado")

    return user


def require_profiles(*profiles: PerfilEnum):
    """Gera uma dependência que exige um dos perfis fornecidos.

    Uso::

        @router.get("/admin")
        async def admin_only(user = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO))):
            ...

    Args:
        *profiles: Um ou mais perfis autorizados a acessar o endpoint.

    Returns:
        Dependência FastAPI que retorna o usuário autenticado ou levanta 403.
    """
    async def checker(current_user: Usuario = Depends(get_current_user)) -> Usuario:
        if current_user.perfil not in profiles:
            logger.warning(
                "require_profiles: acesso negado → user_id=%d  perfil=%s  exigido=%s",
                current_user.id, current_user.perfil.value,
                [p.value for p in profiles],
            )
            raise HTTPException(status_code=403, detail="Acesso não autorizado para este perfil")
        return current_user

    return checker


def get_client_ip(request: Request) -> str:
    """Extrai o endereço IP real do cliente, respeitando proxies reversos.

    Lê o cabeçalho ``X-Forwarded-For`` quando presente (ex: Nginx).
    Fallback para ``request.client.host``.

    Args:
        request: Objeto de requisição do FastAPI/Starlette.

    Returns:
        Endereço IP como string (ex: ``"192.168.1.100"``).
    """
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
