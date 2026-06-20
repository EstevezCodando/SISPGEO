"""Helpers e guards compartilhados entre os sub-routers de pedidos."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pedido import Pedido
from app.models.operacao import Operacao
from app.models.user import Usuario
from app.models.enums import (
    StatusPedidoEnum, PerfilEnum, OrgaoVinculanteEnum,
    SUPERVISOR_PROFILES, CONSOLIDADOR_PROFILES,
)
from app.schemas.pedido import PedidoOut
from app.services import pedido_service
from app.services.pedido_service import (
    SUPERVISOR_TO_RM as _SUPERVISOR_TO_RM,
    RM_TO_SUPERVISOR as _RM_TO_SUPERVISOR,
)
from app.utils.postos import abrev_posto as _abrev_posto

# ── Constantes compartilhadas ─────────────────────────────────────────────────

GESTOR_PROFILES = tuple(SUPERVISOR_PROFILES | CONSOLIDADOR_PROFILES)
# Alias — supervisores regionais roteiam pedidos por regiao_militar
_GESTORES_POR_RM = SUPERVISOR_PROFILES

SUPERVISOR_TO_RM = _SUPERVISOR_TO_RM
RM_TO_SUPERVISOR = _RM_TO_SUPERVISOR


def _rm_do_supervisor(user: Usuario) -> str | None:
    """Retorna o código da Região Militar de um supervisor derivado do seu perfil.

    Usar o perfil (e.g. SUPERVISOR_CML → "CML") é mais robusto do que usar
    ``user.regiao_militar``, que pode estar NULL ou incorretamente configurado no banco.
    Para o perfil SUPERVISOR legado (sem RM codificada), cai para ``user.regiao_militar``.
    """
    rm = _SUPERVISOR_TO_RM.get(user.perfil)
    return rm if rm is not None else user.regiao_militar


async def _check_janela_open(db: AsyncSession, user: Usuario) -> None:
    """Raises HTTP 403 if the user's temporal janela is not currently open.

    Gestores cartográficos and analistas CGEO are always unrestricted (janela=None).
    """
    from app.models.janela import JanelaPedidos
    from app.models.enums import TipoJanelaEnum

    if user.perfil in SUPERVISOR_PROFILES:
        tipo = TipoJanelaEnum.SUPERVISOR
    elif user.perfil in CONSOLIDADOR_PROFILES:
        tipo = TipoJanelaEnum.CONSOLIDADOR
    else:
        return  # GESTOR_CARTOGRAFICO, ANALISTA_CGEO — sem restrição de janela

    now = datetime.now(timezone.utc)
    result = await db.scalars(
        select(JanelaPedidos)
        .where(JanelaPedidos.tipo_janela == tipo)
        .order_by(JanelaPedidos.data_inicio.desc())
    )
    janelas = list(result)
    if not janelas:
        raise HTTPException(status_code=403, detail="Fora do período de ação: janela não configurada para o seu perfil")

    ativa = next((j for j in janelas if j.data_inicio <= now <= j.data_fim), None)
    if not ativa:
        prox = next((j for j in sorted(janelas, key=lambda j: j.data_inicio) if j.data_inicio > now), None)
        if prox:
            raise HTTPException(
                status_code=403,
                detail=f"Sua janela de ação ainda não iniciou. Início previsto: {prox.data_inicio.strftime('%d/%m/%Y')}",
            )
        raise HTTPException(status_code=403, detail="Sua janela de ação foi encerrada. Aguarde o próximo ciclo.")


async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]:
    """Enrich pedido list with usuario_nome, contact info and operacao_nome."""
    if not pedidos:
        return []

    user_ids = {p.usuario_id for p in pedidos}
    if hasattr(pedidos[0], 'criador_id'):
        user_ids |= {p.criador_id for p in pedidos if p.criador_id is not None}
    op_ids = {p.operacao_id for p in pedidos if p.operacao_id}

    user_rows = await db.execute(
        select(
            Usuario.id, Usuario.nome, Usuario.nome_de_guerra, Usuario.om, Usuario.email,
            Usuario.telefone, Usuario.telefone_ritex, Usuario.secao_om,
            Usuario.perfil, Usuario.posto_graduacao,
        ).where(Usuario.id.in_(user_ids))
    )
    users: dict[int, dict] = {
        r.id: {
            "nome": r.nome,
            "nome_de_guerra": r.nome_de_guerra,
            "om": r.om,
            "email": r.email,
            "telefone": r.telefone,
            "telefone_ritex": r.telefone_ritex,
            "secao_om": r.secao_om,
            "perfil": r.perfil.value if r.perfil else None,
            "posto_graduacao": r.posto_graduacao,
        }
        for r in user_rows
    }

    ops: dict[int, str] = {}
    if op_ids:
        op_rows = await db.execute(
            select(Operacao.id, Operacao.nome).where(Operacao.id.in_(op_ids))
        )
        ops = {r.id: r.nome for r in op_rows}

    result = []
    for p in pedidos:
        out = PedidoOut.model_validate(p)
        u = users.get(p.usuario_id, {})
        out.usuario_nome = u.get("nome")
        out.usuario_om = u.get("om")
        out.usuario_email = u.get("email")
        out.usuario_telefone = u.get("telefone")
        out.usuario_telefone_ritex = u.get("telefone_ritex")
        out.usuario_secao_om = u.get("secao_om")
        out.usuario_perfil = u.get("perfil")
        out.usuario_posto_graduacao = u.get("posto_graduacao")
        out.usuario_nome_de_guerra = u.get("nome_de_guerra")
        out.operacao_nome = ops.get(p.operacao_id) if p.operacao_id else None
        out.criador_id = p.criador_id
        out.criador_nome = users.get(p.criador_id, {}).get("nome") if p.criador_id else None
        ov = p.orgao_vinculante.value if p.orgao_vinculante else ""
        out.cadeia_aprovacao = pedido_service.cadeia_aprovacao(ov, p.regiao_militar)
        result.append(out)
    return result
