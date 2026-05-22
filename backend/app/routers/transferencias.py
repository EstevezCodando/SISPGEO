"""
Endpoints de consulta ao histórico de herança/transferência de pedidos.

Acessos permitidos:
  - ``GET /transferencias/minhas`` — usuário vê suas próprias transferências (cedidas ou herdadas)
  - ``GET /transferencias/usuario/{user_id}`` — GESTOR_CARTOGRAFICO vê transferências de qualquer usuário
  - ``GET /transferencias`` — GESTOR_CARTOGRAFICO lista todas as transferências do sistema
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.dependencies import get_current_user, require_profiles
from app.models.pedido_transferencia import PedidoTransferencia
from app.models.user import Usuario
from app.models.enums import PerfilEnum

router = APIRouter(prefix="/transferencias", tags=["Transferências"])


class TransferenciaOut(BaseModel):
    id: int
    pedido_id: int
    de_usuario_id: int | None
    de_usuario_nome: str | None
    para_usuario_id: int | None
    para_usuario_nome: str | None
    executor_id: int | None
    executor_nome: str | None
    observacao: str | None
    transferido_em: datetime

    model_config = {"from_attributes": True}


async def _enrich_transferencias(
    db: AsyncSession, rows: list[PedidoTransferencia]
) -> list[TransferenciaOut]:
    """Enriquece registros de transferência com nomes de usuários."""
    if not rows:
        return []

    user_ids: set[int] = set()
    for r in rows:
        for uid in (r.de_usuario_id, r.para_usuario_id, r.executor_id):
            if uid is not None:
                user_ids.add(uid)

    names: dict[int, str] = {}
    if user_ids:
        result = await db.execute(
            select(Usuario.id, Usuario.nome).where(Usuario.id.in_(user_ids))
        )
        names = {row.id: row.nome for row in result}

    out = []
    for r in rows:
        out.append(TransferenciaOut(
            id=r.id,
            pedido_id=r.pedido_id,
            de_usuario_id=r.de_usuario_id,
            de_usuario_nome=names.get(r.de_usuario_id) if r.de_usuario_id else None,
            para_usuario_id=r.para_usuario_id,
            para_usuario_nome=names.get(r.para_usuario_id) if r.para_usuario_id else None,
            executor_id=r.executor_id,
            executor_nome=names.get(r.executor_id) if r.executor_id else None,
            observacao=r.observacao,
            transferido_em=r.transferido_em,
        ))
    return out


@router.get("/minhas", response_model=list[TransferenciaOut])
async def get_minhas_transferencias(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Retorna transferências em que o usuário foi cedente ou herdeiro."""
    rows = list(await db.scalars(
        select(PedidoTransferencia)
        .where(
            (PedidoTransferencia.de_usuario_id == current_user.id)
            | (PedidoTransferencia.para_usuario_id == current_user.id)
        )
        .order_by(PedidoTransferencia.transferido_em.desc())
        .limit(100)
    ))
    return await _enrich_transferencias(db, rows)


@router.get("/usuario/{user_id}", response_model=list[TransferenciaOut])
async def get_usuario_transferencias(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """GESTOR_CARTOGRAFICO: histórico de transferências de um usuário específico."""
    rows = list(await db.scalars(
        select(PedidoTransferencia)
        .where(
            (PedidoTransferencia.de_usuario_id == user_id)
            | (PedidoTransferencia.para_usuario_id == user_id)
        )
        .order_by(PedidoTransferencia.transferido_em.desc())
    ))
    return await _enrich_transferencias(db, rows)


@router.get("/", response_model=list[TransferenciaOut])
async def get_all_transferencias(
    limit: int = 200,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """GESTOR_CARTOGRAFICO: lista paginada de todas as transferências do sistema."""
    rows = list(await db.scalars(
        select(PedidoTransferencia)
        .order_by(PedidoTransferencia.transferido_em.desc())
        .limit(limit)
        .offset(offset)
    ))
    return await _enrich_transferencias(db, rows)
