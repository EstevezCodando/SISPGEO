"""Endpoints dos gestores: revisar, consolidar, atribuir CGEO, homologados, CGEO review."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_profiles
from app.models.pedido import Pedido, ItemPedido
from app.models.user import Usuario
from app.models.enums import (
    StatusPedidoEnum, PerfilEnum,
    SUPERVISOR_PROFILES, CONSOLIDADOR_PROFILES,
)
from app.schemas.pedido import (
    PedidoOut, ReviewPedidoRequest, AssignCGEORequest, CGEOReviewRequest,
)
from app.services import pedido_service
from app.services.notification_service import NotificationService
from app.routers.pedidos._guards import (
    _enrich, _check_janela_open, _rm_do_supervisor,
    GESTOR_PROFILES, _GESTORES_POR_RM,
)

router = APIRouter(prefix="/pedidos", tags=["Pedidos — Gestores"])


_PENDING_STATUS: dict[PerfilEnum, StatusPedidoEnum] = {
    PerfilEnum.SUPERVISOR:   StatusPedidoEnum.AGUARDANDO_SUPERVISOR,
    PerfilEnum.CONSOLIDADOR: StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR,
}


class ConsolidateRequest(BaseModel):
    pedido_ids: list[int]


@router.get("/pending", response_model=list[PedidoOut])
async def list_pending(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.perfil in _GESTORES_POR_RM:
        result = await db.scalars(
            select(Pedido)
            .where(
                Pedido.status == StatusPedidoEnum.AGUARDANDO_SUPERVISOR,
                Pedido.regiao_militar == _rm_do_supervisor(current_user),
            )
            .order_by(Pedido.submetido_gestor_em.asc())
        )
    elif current_user.perfil in CONSOLIDADOR_PROFILES:
        result = await db.scalars(
            select(Pedido)
            .where(
                Pedido.status == StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR,
                Pedido.orgao_vinculante == current_user.orgao_vinculante,
            )
            .order_by(Pedido.submetido_gestor_em.asc())
        )
    elif current_user.perfil == PerfilEnum.GESTOR_CARTOGRAFICO:
        result = await db.scalars(
            select(Pedido)
            .where(Pedido.status == StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO)
            .order_by(Pedido.submetido_dsg_em.asc())
        )
    elif current_user.perfil == PerfilEnum.ANALISTA_CGEO:
        result = await db.scalars(
            select(Pedido)
            .where(Pedido.status == StatusPedidoEnum.ATRIBUIDO_CGEO, Pedido.cgeo_id == current_user.cgeo_id)
            .order_by(Pedido.criado_em.asc())
        )
    else:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
    return await _enrich(db, list(result))


@router.get("/homologados", response_model=list[PedidoOut])
async def list_homologados(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(*GESTOR_PROFILES)),
):
    """Lista pedidos já encaminhados além da fila atual do gestor."""
    if current_user.perfil in SUPERVISOR_PROFILES:
        forwarded = [
            StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR,
            StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO,
            StatusPedidoEnum.ATRIBUIDO_CGEO,
            StatusPedidoEnum.APROVADO,
            StatusPedidoEnum.PRODUZIDO,
            StatusPedidoEnum.REPROVADO,
        ]
        result = await db.scalars(
            select(Pedido)
            .where(
                Pedido.status.in_(forwarded),
                Pedido.regiao_militar == _rm_do_supervisor(current_user),
            )
            .order_by(Pedido.atualizado_em.desc())
        )
    elif current_user.perfil in CONSOLIDADOR_PROFILES:
        forwarded = [
            StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO,
            StatusPedidoEnum.ATRIBUIDO_CGEO,
            StatusPedidoEnum.APROVADO,
            StatusPedidoEnum.PRODUZIDO,
            StatusPedidoEnum.REPROVADO,
        ]
        result = await db.scalars(
            select(Pedido)
            .where(
                Pedido.status.in_(forwarded),
                Pedido.orgao_vinculante == current_user.orgao_vinculante,
            )
            .order_by(Pedido.atualizado_em.desc())
        )
    else:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
    return await _enrich(db, list(result))


@router.get("/cgeo-atendimento", response_model=list[PedidoOut])
async def cgeo_list_atendimento(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(PerfilEnum.ANALISTA_CGEO)),
):
    """CGEO: lista pedidos em atendimento (APROVADO) — candidatos a 'Dar Pronto'."""
    result = await db.scalars(
        select(Pedido)
        .where(
            Pedido.status == StatusPedidoEnum.APROVADO,
            Pedido.cgeo_id == current_user.cgeo_id,
        )
        .order_by(Pedido.aprovado_em.asc())
    )
    return await _enrich(db, list(result))


@router.put("/{pedido_id}/review", response_model=PedidoOut)
async def review(
    pedido_id: int,
    body: ReviewPedidoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(*GESTOR_PROFILES)),
):
    if body.acao != "observar":
        await _check_janela_open(db, current_user)
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return await pedido_service.review_pedido(db, pedido, current_user, body.acao, body.motivo, body.observacoes)


@router.post("/consolidate")
async def consolidate(
    body: ConsolidateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(*GESTOR_PROFILES)),
):
    await _check_janela_open(db, current_user)
    return await pedido_service.consolidate_pedidos(db, body.pedido_ids, current_user)


@router.put("/{pedido_id}/assign-cgeo", response_model=PedidoOut)
async def assign_cgeo(
    pedido_id: int,
    body: AssignCGEORequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return await pedido_service.assign_cgeo(db, pedido, body.cgeo_id, current_user)


@router.put("/{pedido_id}/cgeo-review", response_model=PedidoOut)
async def cgeo_review(
    pedido_id: int,
    body: CGEOReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(PerfilEnum.ANALISTA_CGEO)),
):
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return await pedido_service.cgeo_review(db, pedido, current_user, body.acao, body.motivo, body.link_bdgex)


@router.delete("/{pedido_id}/items/{item_id}", status_code=204)
async def delete_item(
    pedido_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Remove um item (célula) de um pedido."""
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    is_owner = pedido.usuario_id == current_user.id
    is_supervisor = (
        current_user.perfil in SUPERVISOR_PROFILES
        and pedido.status == StatusPedidoEnum.AGUARDANDO_SUPERVISOR
        and pedido.regiao_militar == _rm_do_supervisor(current_user)
    )
    is_consolidador = (
        current_user.perfil in CONSOLIDADOR_PROFILES
        and pedido.status == StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR
        and pedido.orgao_vinculante == current_user.orgao_vinculante
    )

    if not (is_owner or is_supervisor or is_consolidador):
        raise HTTPException(status_code=403, detail="Acesso negado")

    if is_owner and pedido.status != StatusPedidoEnum.RASCUNHO:
        raise HTTPException(status_code=400, detail="Pedido não pode ser editado neste status")

    if is_supervisor or is_consolidador:
        await _check_janela_open(db, current_user)

    item = await db.get(ItemPedido, item_id)
    if not item or item.pedido_id != pedido_id:
        raise HTTPException(status_code=404, detail="Item não encontrado")

    count_res = await db.execute(
        select(ItemPedido).where(ItemPedido.pedido_id == pedido_id)
    )
    if len(count_res.all()) <= 1:
        raise HTTPException(status_code=400, detail="Não é possível remover o único item do pedido")
    await db.delete(item)
    await db.commit()


class DarProntoRequest(BaseModel):
    observacoes: str
    link_bdgex: str | None = None


@router.post("/{pedido_id}/dar-pronto", response_model=PedidoOut)
async def dar_pronto(
    pedido_id: int,
    body: DarProntoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """DSG/Admin marca um pedido como PRODUZIDO e notifica toda a cadeia solicitante."""
    from app.services.historico_service import registrar_historico

    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    status_anterior = pedido.status
    pedido.status = StatusPedidoEnum.PRODUZIDO
    pedido.observacoes = body.observacoes
    if body.link_bdgex:
        pedido.link_bdgex = body.link_bdgex

    await registrar_historico(
        db, pedido=pedido, usuario=current_user, acao="dar_pronto",
        status_anterior=status_anterior,
    )
    await db.commit()
    await db.refresh(pedido)

    svc = NotificationService(db)
    titulo = f"✅ Pedido #{pedido_id} — Produto Disponível"
    link_txt = f" | Link: {body.link_bdgex}" if body.link_bdgex else ""
    mensagem = f"O pedido #{pedido_id} foi marcado como Produzido. {body.observacoes}{link_txt}"

    await svc.notify_user(pedido.usuario_id, titulo, mensagem, pedido_id)

    if pedido.regiao_militar:
        await svc.notify_by_perfil(
            PerfilEnum.SUPERVISOR, titulo, mensagem, pedido_id,
            regiao_militar=pedido.regiao_militar,
        )

    if pedido.orgao_vinculante:
        await svc.notify_by_perfil(
            PerfilEnum.CONSOLIDADOR, titulo, mensagem, pedido_id,
            orgao_vinculante=pedido.orgao_vinculante,
        )

    await db.commit()

    enriched = await _enrich(db, [pedido])
    return enriched[0]
