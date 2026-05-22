"""
Middleware de coleta de métricas HTTP do SISGEO.

Intercepta todas as requisições, mede o tempo de processamento e persiste
os dados em :class:`~app.models.api_metrica.ApiMetrica` de forma assíncrona
(fire-and-forget), sem adicionar latência ao caminho crítico.

Paths excluídos automaticamente: health check, Swagger/ReDoc, assets estáticos.
"""

import asyncio
import logging
import time

from fastapi import Request
from fastapi.responses import Response

from app.database import AsyncSessionLocal
from app.models.api_metrica import ApiMetrica
from app.utils.security import decode_access_token

logger = logging.getLogger(__name__)

# Prefixos que não devem ser registrados
_EXCLUDED_PREFIXES: tuple[str, ...] = (
    "/api/docs",
    "/api/redoc",
    "/api/openapi.json",
    "/api/v1/health",
)


def _is_excluded(path: str) -> bool:
    return any(path.startswith(p) for p in _EXCLUDED_PREFIXES)


def _normalize_path(request: Request) -> str:
    """Retorna o path template da rota correspondente (ex: ``/api/v1/pedidos/{pedido_id}``).

    Usa o scope ``"route"`` que o FastAPI preenche após o roteamento.
    Se não estiver disponível (rota não encontrada), usa o path literal.
    """
    route = request.scope.get("route")
    if route and hasattr(route, "path"):
        return route.path
    return request.url.path


def _extract_user_id(request: Request) -> int | None:
    """Tenta extrair o user_id do JWT no cabeçalho Authorization.

    Nunca propaga exceções — retorna ``None`` em qualquer falha.
    """
    try:
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        payload = decode_access_token(auth[7:])
        return int(payload["user_id"]) if payload and "user_id" in payload else None
    except Exception:
        return None


async def _persist_metric(
    method: str,
    endpoint: str,
    status_code: int,
    duration_ms: float,
    usuario_id: int | None,
    ip_address: str | None,
) -> None:
    """Persiste uma métrica no banco de dados.

    Cria sua própria sessão para não depender da sessão da requisição
    (que pode já ter sido fechada quando esta task executa).
    """
    try:
        async with AsyncSessionLocal() as db:
            db.add(ApiMetrica(
                method=method,
                endpoint=endpoint,
                status_code=status_code,
                duration_ms=round(duration_ms, 2),
                usuario_id=usuario_id,
                ip_address=ip_address,
            ))
            await db.commit()
    except Exception as exc:
        logger.debug("metrics: falha ao persistir → %s", exc)


async def metrics_middleware(request: Request, call_next) -> Response:
    """Middleware ASGI que coleta métricas de tempo e volume por endpoint.

    Registra: método HTTP, path normalizado, status code, duração (ms),
    user_id (se autenticado) e IP do cliente.
    """
    if _is_excluded(request.url.path):
        return await call_next(request)

    # Captura user_id ANTES do call_next (headers ficam disponíveis)
    usuario_id = _extract_user_id(request)
    ip = request.client.host if request.client else None

    t0 = time.perf_counter()
    response: Response = await call_next(request)
    duration_ms = (time.perf_counter() - t0) * 1000

    endpoint = _normalize_path(request)

    # Fire-and-forget — nunca bloqueia a resposta
    asyncio.create_task(_persist_metric(
        method=request.method,
        endpoint=endpoint,
        status_code=response.status_code,
        duration_ms=duration_ms,
        usuario_id=usuario_id,
        ip_address=ip,
    ))

    # Adiciona header de tempo para debugging/ferramentas de proxy
    response.headers["X-Process-Time-Ms"] = f"{duration_ms:.1f}"
    return response
