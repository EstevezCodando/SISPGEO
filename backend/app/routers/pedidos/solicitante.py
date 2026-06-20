"""Endpoints do solicitante: criar, listar, editar, submeter e cancelar pedidos."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.pedido import Pedido, ItemPedido
from app.models.user import Usuario
from app.models.enums import StatusPedidoEnum, PerfilEnum, SUPERVISOR_PROFILES
from app.schemas.pedido import PedidoCreate, PedidoUpdate, PedidoOut, ReorderRequest
from app.services import pedido_service
from app.services.config_service import get_or_create_config, PRAZO_DEFAULT as PRAZOS_MINIMOS
from app.routers.pedidos._guards import (
    _enrich, _rm_do_supervisor, RM_TO_SUPERVISOR, GESTOR_PROFILES,
    CONSOLIDADOR_PROFILES,
)

router = APIRouter(prefix="/pedidos", tags=["Pedidos — Solicitante"])


class EnviarLoteRequest(BaseModel):
    auto_submitted: bool = False
    pedido_ids: list[int] | None = None  # None = todos os rascunhos do usuário


class SolicitarRemocaoRequest(BaseModel):
    justificativa: str


@router.post("/", response_model=PedidoOut, status_code=201)
async def create_pedido(
    body: PedidoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    ov = body.orgao_vinculante if body.orgao_vinculante is not None else current_user.orgao_vinculante
    if ov is None:
        raise HTTPException(status_code=400, detail="Informe o órgão vinculante ou configure-o no seu perfil")

    # Valida data_entrega >= data_base + prazo_minimo do produto mais restritivo
    if body.itens and body.data_entrega:
        cfg = await get_or_create_config(db)
        max_prazo = max(PRAZOS_MINIMOS.get(item.tipo_produto.value, 30) for item in body.itens)
        data_minima = cfg.data_base + timedelta(days=max_prazo)
        if body.data_entrega < data_minima:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Data de entrega mínima para este pedido: "
                    f"{data_minima.strftime('%d/%m/%Y')} "
                    f"({max_prazo} dias a partir de {cfg.data_base.strftime('%d/%m/%Y')})."
                ),
            )

    # impressao_solicitada derivado: verdadeiro se qualquer item tiver qty de impressão
    any_impressao = any(i.impressao_quantidade for i in body.itens if i.impressao_quantidade)
    pedido = Pedido(
        usuario_id=current_user.id,
        criador_id=current_user.id,
        operacao_id=body.operacao_id,
        data_entrega=body.data_entrega,
        finalidade_geo=body.finalidade_geo,
        finalidade=body.finalidade,
        orgao_vinculante=ov,
        regiao_militar=current_user.regiao_militar,
        impressao_solicitada=any_impressao,
    )
    db.add(pedido)
    await db.flush()

    for item_data in body.itens:
        item = ItemPedido(
            pedido_id=pedido.id,
            tipo_produto=item_data.tipo_produto,
            escala=item_data.escala,
            inom=item_data.inom,
            mi=item_data.mi,
            solicitar_mesmo_disponivel=item_data.solicitar_mesmo_disponivel,
            impressao_quantidade=item_data.impressao_quantidade,
            impressao_tipo_material=item_data.impressao_tipo_material,
            disponivel_bdgex=item_data.disponivel_bdgex,
            data_producao_bdgex=item_data.data_producao_bdgex,
        )
        db.add(item)

    await db.commit()
    await db.refresh(pedido)
    return pedido


@router.get("/", response_model=list[PedidoOut])
async def list_pedidos(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.perfil == PerfilEnum.GESTOR_CARTOGRAFICO:
        result = await db.scalars(
            select(Pedido)
            .where(Pedido.status.in_([StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO, StatusPedidoEnum.ATRIBUIDO_CGEO]))
            .order_by(Pedido.criado_em.desc())
        )
    elif current_user.perfil == PerfilEnum.ANALISTA_CGEO:
        result = await db.scalars(
            select(Pedido)
            .where(Pedido.cgeo_id == current_user.cgeo_id)
            .order_by(Pedido.criado_em.desc())
        )
    elif current_user.perfil in SUPERVISOR_PROFILES:
        result = await db.scalars(
            select(Pedido)
            .where(Pedido.regiao_militar == _rm_do_supervisor(current_user))
            .order_by(Pedido.criado_em.desc())
        )
    elif current_user.perfil in CONSOLIDADOR_PROFILES:
        result = await db.scalars(
            select(Pedido)
            .where(Pedido.orgao_vinculante == current_user.orgao_vinculante)
            .order_by(Pedido.criado_em.desc())
        )
    else:
        result = await db.scalars(
            select(Pedido)
            .where(Pedido.usuario_id == current_user.id)
            .order_by(Pedido.criado_em.desc())
        )
    return await _enrich(db, list(result))


@router.get("/{pedido_id}", response_model=PedidoOut)
async def get_pedido(
    pedido_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    enriched = await _enrich(db, [pedido])
    return enriched[0]


@router.put("/{pedido_id}", response_model=PedidoOut)
async def update_pedido(
    pedido_id: int,
    body: PedidoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Usuário edita metadados do pedido (somente RASCUNHO)."""
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if pedido.usuario_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    editable = {StatusPedidoEnum.RASCUNHO}
    if pedido.status not in editable:
        raise HTTPException(status_code=400, detail="Pedido não pode ser editado neste estágio")

    if body.data_entrega is not None:
        pedido.data_entrega = body.data_entrega
    if body.finalidade_geo is not None:
        pedido.finalidade_geo = body.finalidade_geo
    if body.finalidade is not None:
        pedido.finalidade = body.finalidade
    if body.operacao_id is not None:
        pedido.operacao_id = body.operacao_id

    await db.commit()
    await db.refresh(pedido)
    enriched = await _enrich(db, [pedido])
    return enriched[0]


@router.delete("/{pedido_id}")
async def cancel_pedido(
    pedido_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if pedido.usuario_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    cancelable = {
        StatusPedidoEnum.RASCUNHO,
        StatusPedidoEnum.AGUARDANDO_SUPERVISOR,
        StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR,
    }
    if pedido.status not in cancelable:
        raise HTTPException(status_code=400, detail="Pedido não pode ser cancelado neste estágio")
    pedido.status = StatusPedidoEnum.CANCELADO
    from datetime import datetime, timezone
    pedido.cancelado_em = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Pedido cancelado"}


@router.post("/{pedido_id}/submit", response_model=PedidoOut)
async def submit(
    pedido_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return await pedido_service.submit_pedido(db, pedido, current_user)


@router.post("/enviar-lote", response_model=list[PedidoOut])
async def enviar_lote(
    body: EnviarLoteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Submete todos os pedidos RASCUNHO do usuário em lote."""
    stmt = (
        select(Pedido)
        .where(Pedido.usuario_id == current_user.id)
        .where(Pedido.status == StatusPedidoEnum.RASCUNHO)
        .order_by(Pedido.prioridade)
    )
    if body.pedido_ids:
        stmt = stmt.where(Pedido.id.in_(body.pedido_ids))

    result = await db.execute(stmt)
    pedidos = list(result.scalars().all())

    if not pedidos:
        return []

    submitted = []
    for pedido in pedidos:
        if body.auto_submitted:
            pedido.auto_submitted = True
            await db.flush()
        try:
            p = await pedido_service.submit_pedido(db, pedido, current_user)
            submitted.append(p)
        except HTTPException:
            pass

    return await _enrich(db, submitted)


@router.put("/reorder")
async def reorder_pedidos(
    body: ReorderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Reordena pedidos por prioridade. ordered_ids[0] = maior prioridade."""
    allowed = {PerfilEnum.SOLICITANTE} | SUPERVISOR_PROFILES | CONSOLIDADOR_PROFILES
    if current_user.perfil not in allowed:
        raise HTTPException(status_code=403, detail="Perfil não autorizado")
    from sqlalchemy import update as sa_update
    for rank, pid in enumerate(body.ordered_ids, start=1):
        await db.execute(
            sa_update(Pedido).where(Pedido.id == pid).values(prioridade=rank)
        )
    await db.commit()
    return {"reordenados": len(body.ordered_ids)}


@router.put("/{pedido_id}/items/reorder")
async def reorder_items(
    pedido_id: int,
    body: ReorderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Reordena itens dentro de um pedido por prioridade."""
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    from sqlalchemy import update as sa_update
    for rank, item_id in enumerate(body.ordered_ids, start=1):
        await db.execute(
            sa_update(ItemPedido)
            .where(ItemPedido.id == item_id, ItemPedido.pedido_id == pedido_id)
            .values(prioridade=rank)
        )
    await db.commit()
    return {"reordenados": len(body.ordered_ids)}


@router.post("/{pedido_id}/solicitar-remocao")
async def solicitar_remocao(
    pedido_id: int,
    body: SolicitarRemocaoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Solicita remoção ao Supervisor (somente enquanto AGUARDANDO_SUPERVISOR)."""
    from app.models.notificacao import Notificacao

    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if pedido.usuario_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    if pedido.status != StatusPedidoEnum.AGUARDANDO_SUPERVISOR:
        raise HTTPException(
            status_code=400,
            detail="Remoção só pode ser solicitada enquanto o pedido aguarda revisão do Supervisor (C. Mil. A)",
        )

    supervisor_perfil = RM_TO_SUPERVISOR.get(pedido.regiao_militar or "")
    if supervisor_perfil:
        _gestores_q = select(Usuario).where(
            Usuario.perfil == supervisor_perfil,
            Usuario.ativo == True,
        )
    else:
        _gestores_q = select(Usuario).where(
            Usuario.perfil.in_(SUPERVISOR_PROFILES),
            Usuario.regiao_militar == pedido.regiao_militar,
            Usuario.ativo == True,
        )
    gestores = await db.scalars(_gestores_q)
    for g in list(gestores):
        db.add(Notificacao(
            usuario_id=g.id,
            titulo=f"Solicitação de remoção — Pedido #{pedido.id}",
            mensagem=(
                f"{current_user.nome} solicita remoção do pedido #{pedido.id}. "
                f"Justificativa: {body.justificativa}"
            ),
            pedido_id=pedido.id,
        ))
    await db.commit()
    return {"message": "Solicitação de remoção enviada ao Supervisor"}
