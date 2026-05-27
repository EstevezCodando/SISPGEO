"""
Router de histórico de pedidos do SISGEO.

Expõe o audit trail completo de cada pedido - cada transição de status,
quem a executou e quando.

Endpoints:
- ``GET /pedidos/{id}/historico`` - histórico de um pedido específico.
- ``GET /historico``             - histórico global, apenas para Gestor DSG.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_profiles
from app.models.pedido import Pedido
from app.models.pedido_historico import PedidoHistorico
from app.models.user import Usuario
from app.models.enums import PerfilEnum
from app.schemas.historico import PedidoHistoricoOut

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Histórico"])


async def _enrich(
    entries: list[PedidoHistorico], db: AsyncSession
) -> list[PedidoHistoricoOut]:
    """Enriquece registros de histórico com o nome do usuário."""
    user_cache: dict[int, str] = {}
    result = []
    for e in entries:
        nome = None
        if e.usuario_id:
            if e.usuario_id not in user_cache:
                u = await db.get(Usuario, e.usuario_id)
                user_cache[e.usuario_id] = u.nome if u else f"#{e.usuario_id}"
            nome = user_cache[e.usuario_id]
        out = PedidoHistoricoOut.model_validate(e)
        out.usuario_nome = nome
        result.append(out)
    return result


@router.get("/pedidos/{pedido_id}/historico", response_model=list[PedidoHistoricoOut])
async def get_historico_pedido(
    pedido_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Retorna o histórico completo de transições de um pedido específico.

    Acessível ao dono do pedido ou a qualquer gestor do sistema.

    Args:
        pedido_id: ID do pedido a consultar.
    """
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    # Dono do pedido ou qualquer gestor pode consultar
    is_owner = pedido.usuario_id == current_user.id
    is_gestor = current_user.perfil not in (PerfilEnum.SOLICITANTE,)
    if not (is_owner or is_gestor):
        raise HTTPException(status_code=403, detail="Acesso não autorizado")

    rows = list(await db.scalars(
        select(PedidoHistorico)
        .where(PedidoHistorico.pedido_id == pedido_id)
        .order_by(PedidoHistorico.criado_em)
    ))
    logger.debug("historico → pedido_id=%d  entries=%d", pedido_id, len(rows))
    return await _enrich(rows, db)


@router.get("/historico", response_model=list[PedidoHistoricoOut])
async def get_historico_global(
    limit: int = 200,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Retorna o histórico global de todos os pedidos (somente Gestor DSG).

    Args:
        limit:  Número máximo de registros (padrão 200).
        offset: Registros a pular para paginação (padrão 0).
    """
    rows = list(await db.scalars(
        select(PedidoHistorico)
        .order_by(desc(PedidoHistorico.criado_em))
        .limit(limit)
        .offset(offset)
    ))
    logger.debug("historico global → entries=%d  offset=%d", len(rows), offset)
    return await _enrich(rows, db)
