"""
Serviço de pedidos do SISGEO.

Contém toda a lógica de negócio relacionada ao ciclo de vida de um
:class:`~app.models.pedido.Pedido`: submissão, revisão por gestores,
consolidação, atribuição ao CGEO e análise de viabilidade.

Princípios aplicados:
- **SRP**: notificações delegadas ao :class:`~app.services.notification_service.NotificationService`.
- **OCP / tabelas de roteamento**: novos perfis são adicionados nos dicionários
  ``_SUBMIT_ROUTING`` / ``_CONSOLIDATE_ROUTING`` sem alterar a lógica das funções.
- **Logging estruturado**: cada operação de negócio registra entrada e saída.
"""

import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException

from app.models.pedido import Pedido
from app.models.operacao import Operacao
from app.models.user import Usuario
from app.models.enums import (
    StatusPedidoEnum, PerfilEnum, TipoProdutoEnum,
    SUPERVISOR_PROFILES, CONSOLIDADOR_PROFILES,
)
from app.services.email_service import send_email
from app.services.notification_service import NotificationService
from app.services.historico_service import registrar_historico
from app.models.pedido_transferencia import PedidoTransferencia
from app.utils.email_templates import (
    pedido_submetido, pedido_aprovado, pedido_reprovado, pedido_produzido,
    pedido_transferido, notificar_gestor,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constantes de negócio
# ---------------------------------------------------------------------------

FATOR_PRAZO: dict[TipoProdutoEnum, int] = {
    TipoProdutoEnum.CARTA_TOPOGRAFICA: 180,
    TipoProdutoEnum.CARTA_ORTOIMAGEM:  180,
    TipoProdutoEnum.ORTOIMAGEM:        120,
    TipoProdutoEnum.MDT:               120,
    TipoProdutoEnum.MDS:               120,
    TipoProdutoEnum.CDGV:              240,
    TipoProdutoEnum.IMPRESSAO:          30,
}

# Perfis globais — não devem ser filtrados por orgao_vinculante nem regiao_militar.
_PERFIS_GLOBAIS: frozenset[PerfilEnum] = frozenset({PerfilEnum.GESTOR_CARTOGRAFICO})

# CMilA → perfil de supervisor responsável
RM_TO_SUPERVISOR: dict[str, PerfilEnum] = {
    "CMP":   PerfilEnum.SUPERVISOR_CMP,
    "CML":   PerfilEnum.SUPERVISOR_CML,
    "CMS":   PerfilEnum.SUPERVISOR_CMS,
    "CMO":   PerfilEnum.SUPERVISOR_CMO,
    "CMAO":  PerfilEnum.SUPERVISOR_CMAO,
    "CMA":   PerfilEnum.SUPERVISOR_CMA,
    "CMNE":  PerfilEnum.SUPERVISOR_CMNE,
    "CMSE":  PerfilEnum.SUPERVISOR_CMSE,
}

# Órgão vinculante → perfil de consolidador responsável
ORG_TO_CONSOLIDADOR: dict[str, PerfilEnum] = {
    "COTER": PerfilEnum.CONSOLIDADOR_COTER,
    "DSG":   PerfilEnum.CONSOLIDADOR_DSG,
    "DEC":   PerfilEnum.CONSOLIDADOR_DEC,
    "COLOG": PerfilEnum.CONSOLIDADOR_COLOG,
    "DECEx": PerfilEnum.CONSOLIDADOR_DECEX,
}

# Mapeamento perfil → (status atual esperado, próximo status, perfil a notificar)
# Supervisores regionais todos avançam para CONSOLIDADOR_COTER.
# Consolidadores de qualquer órgão avançam para GESTOR_CARTOGRAFICO.
_CONSOLIDATE_ROUTING: dict[PerfilEnum, tuple[StatusPedidoEnum, StatusPedidoEnum, PerfilEnum]] = {
    **{p: (StatusPedidoEnum.AGUARDANDO_SUPERVISOR,   StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR, PerfilEnum.CONSOLIDADOR_COTER) for p in SUPERVISOR_PROFILES},
    **{p: (StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR, StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO, PerfilEnum.GESTOR_CARTOGRAFICO) for p in CONSOLIDADOR_PROFILES},
}

_CONSOLIDATE_LABELS: dict[PerfilEnum, str] = {
    **{p: "encaminhado ao Consolidador COTER" for p in SUPERVISOR_PROFILES},
    **{p: "submetido ao Gestor Cartográfico (DSG)" for p in CONSOLIDADOR_PROFILES},
}


def cadeia_aprovacao(orgao_vinculante: str, regiao_militar: str | None) -> list[str]:
    """Retorna a cadeia de aprovação de um pedido conforme seu órgão vinculante."""
    cmila_label = regiao_militar or "CMilA"
    if orgao_vinculante == "COTER":
        return [
            "Solicitante",
            f"Supervisor {cmila_label}",
            "Consolidador COTER",
            "Gestor Cartográfico (DSG)",
            "Analista CGEO",
        ]
    consolidador_labels = {
        "DSG":   "Consolidador DSG",
        "DEC":   "Consolidador DEC",
        "COLOG": "Consolidador COLOG",
        "DECEx": "Consolidador DECEx",
    }
    consolidador = consolidador_labels.get(orgao_vinculante, f"Consolidador {orgao_vinculante}")
    return [
        "Solicitante",
        consolidador,
        "Gestor Cartográfico (DSG)",
        "Analista CGEO",
    ]


# ---------------------------------------------------------------------------
# Funções do serviço
# ---------------------------------------------------------------------------

async def submit_pedido(db: AsyncSession, pedido: Pedido, current_user: Usuario) -> Pedido:
    """Submete um pedido em rascunho para o próximo escalão.

    Valida o estado do pedido, avança o status de acordo com o perfil do
    usuário, envia e-mail de confirmação ao solicitante e notifica os gestores
    do escalão seguinte.

    Args:
        db:           Sessão assíncrona do banco de dados.
        pedido:       Instância ORM do pedido a submeter.
        current_user: Usuário que realiza a ação.

    Returns:
        Pedido atualizado e persistido.

    Raises:
        HTTPException 400: Pedido não está em rascunho ou sem itens.
        HTTPException 403: Usuário sem permissão para submeter ou dono incorreto.
    """
    logger.info("submit_pedido → pedido_id=%d  usuário=%s", pedido.id, current_user.email)

    if pedido.status != StatusPedidoEnum.RASCUNHO:
        raise HTTPException(status_code=400, detail="Pedido já foi submetido")
    if pedido.usuario_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    if not pedido.itens:
        raise HTTPException(status_code=400, detail="Adicione ao menos um produto ao pedido")

    perfil = current_user.perfil
    ov = str(pedido.orgao_vinculante.value if pedido.orgao_vinculante else "") or (
        str(current_user.orgao_vinculante.value) if current_user.orgao_vinculante else ""
    )

    # Determina próximo status e perfil a notificar conforme perfil + órgão
    if perfil == PerfilEnum.SOLICITANTE:
        if ov == "COTER":
            supervisor_perfil = RM_TO_SUPERVISOR.get(pedido.regiao_militar or "")
            if not supervisor_perfil:
                raise HTTPException(
                    status_code=400,
                    detail="Região Militar não configurada ou não mapeada para supervisor. "
                           "Atualize seu cadastro com o Comando Militar de Área.",
                )
            next_status = StatusPedidoEnum.AGUARDANDO_SUPERVISOR
            notify_perfil = supervisor_perfil
        elif ov in ORG_TO_CONSOLIDADOR:
            next_status = StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR
            notify_perfil = ORG_TO_CONSOLIDADOR[ov]
        else:
            raise HTTPException(
                status_code=400,
                detail="Órgão vinculante não configurado. Contate o administrador.",
            )
    elif perfil in SUPERVISOR_PROFILES:
        next_status = StatusPedidoEnum.AGUARDANDO_SUPERVISOR
        notify_perfil = perfil
    elif perfil in CONSOLIDADOR_PROFILES:
        next_status = StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR
        notify_perfil = perfil
    elif perfil == PerfilEnum.SUPERVISOR:   # legado
        next_status = StatusPedidoEnum.AGUARDANDO_SUPERVISOR
        notify_perfil = perfil
    elif perfil == PerfilEnum.CONSOLIDADOR:  # legado
        next_status = StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR
        notify_perfil = perfil
    else:
        raise HTTPException(status_code=403, detail="Perfil não autorizado a submeter pedidos")

    status_anterior = pedido.status
    pedido.status = next_status
    pedido.submetido_gestor_em = datetime.now(timezone.utc)
    await registrar_historico(db, pedido, current_user, "submeter", status_anterior)
    await db.commit()
    await db.refresh(pedido)

    # E-mail de confirmação ao solicitante
    operacao_nome = "Sem operação"
    if pedido.operacao_id:
        operacao = await db.get(Operacao, pedido.operacao_id)
        if operacao:
            operacao_nome = operacao.nome

    subject, html = pedido_submetido(current_user.nome, pedido.id, operacao_nome)
    await send_email(current_user.email, subject, html)

    # Notifica o perfil do próximo escalão por e-mail + in-app.
    # Supervisores regionais → localizados apenas pelo perfil (já encapsula o CMilA).
    # Consolidadores específicos → localizados pelo perfil (já encapsula o órgão).
    # Gestor Cartográfico → global.
    if notify_perfil in _PERFIS_GLOBAIS:
        gestor_query = select(Usuario).where(
            Usuario.perfil == notify_perfil,
            Usuario.ativo == True,
        )
    else:
        gestor_query = select(Usuario).where(
            Usuario.perfil == notify_perfil,
            Usuario.ativo == True,
        )

    gestores = list(await db.scalars(gestor_query))
    if not gestores:
        logger.warning(
            "submit_pedido: nenhum gestor encontrado — perfil=%s  pedido_id=%d",
            notify_perfil.value, pedido.id,
        )

    for g in gestores:
        subject_g, html_g = notificar_gestor(g.nome, current_user.nome, pedido.id, current_user.om)
        await send_email(g.email, subject_g, html_g)

    svc = NotificationService(db)
    await svc.notify_by_perfil(
        perfil=notify_perfil,
        titulo=f"Novo pedido #{pedido.id}",
        mensagem=f"Pedido de {current_user.nome} ({current_user.om}) aguarda revisão.",
        pedido_id=pedido.id,
    )
    await db.commit()

    logger.info(
        "submit_pedido OK → pedido_id=%d  novo_status=%s  notificados=%d",
        pedido.id, next_status.value, len(gestores),
    )
    return pedido


async def review_pedido(
    db: AsyncSession,
    pedido: Pedido,
    gestor: Usuario,
    acao: str,
    motivo: str | None,
    observacoes: str | None = None,
) -> Pedido:
    """Revisa um pedido individualmente (aprovar, devolver para edição ou reprovar).

    Args:
        db:           Sessão assíncrona do banco de dados.
        pedido:       Pedido a revisar.
        gestor:       Gestor que executa a ação.
        acao:         ``"aprovar"``, ``"editar"`` ou ``"reprovar"``.
        motivo:       Motivo obrigatório quando ``acao == "reprovar"``.
        observacoes:  Observações opcionais do gestor, salvas no pedido.

    Returns:
        Pedido atualizado e persistido.

    Raises:
        HTTPException 400: Pedido em status inválido para revisão ou ação desconhecida.
    """
    logger.info(
        "review_pedido → pedido_id=%d  gestor=%s  acao=%s",
        pedido.id, gestor.email, acao,
    )

    allowed_statuses = {
        StatusPedidoEnum.AGUARDANDO_SUPERVISOR,
        StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR,
        StatusPedidoEnum.DEVOLVIDO,
    }
    if pedido.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Pedido não está disponível para revisão")

    if observacoes is not None:
        pedido.observacoes = observacoes

    status_anterior = pedido.status

    # Próximo status para "aprovar" depende do grupo de perfil do gestor
    if gestor.perfil in SUPERVISOR_PROFILES:
        _aprovar_status = StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR
    elif gestor.perfil in CONSOLIDADOR_PROFILES:
        _aprovar_status = StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO
    else:
        # Legado / fallback
        _REVIEW_APROVAR_STATUS: dict[PerfilEnum, StatusPedidoEnum] = {
            PerfilEnum.SUPERVISOR:   StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR,
            PerfilEnum.CONSOLIDADOR: StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO,
        }
        _aprovar_status = _REVIEW_APROVAR_STATUS.get(gestor.perfil, StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR)

    if acao == "reprovar":
        pedido.status = StatusPedidoEnum.CANCELADO
        pedido.motivo_reprovacao = motivo
        pedido.cancelado_em = datetime.now(timezone.utc)
        usuario = await db.get(Usuario, pedido.usuario_id)
        if usuario:
            subject, html = pedido_reprovado(usuario.nome, pedido.id, motivo or "Sem motivo informado")
            await send_email(usuario.email, subject, html)

    elif acao == "editar":
        pedido.status = StatusPedidoEnum.DEVOLVIDO
        pedido.gestor_demandante_id = gestor.id

    elif acao == "aprovar":
        pedido.status = _aprovar_status
        pedido.gestor_demandante_id = gestor.id

    elif acao == "observar":
        pass  # Salva apenas as observações sem alterar o status

    else:
        raise HTTPException(status_code=400, detail="Ação inválida")

    if acao != "observar":
        await registrar_historico(db, pedido, gestor, acao, status_anterior, motivo)
    await db.commit()
    await db.refresh(pedido)

    logger.info("review_pedido OK → pedido_id=%d  novo_status=%s", pedido.id, pedido.status.value)
    return pedido


async def consolidate_pedidos(
    db: AsyncSession, pedido_ids: list[int], gestor: Usuario
) -> dict:
    """Consolida e avança um lote de pedidos para o próximo escalão.

    Cada pedido da lista é verificado individualmente: pedidos com status
    inesperado são silenciosamente ignorados (sem interromper o lote).

    Args:
        db:         Sessão assíncrona do banco de dados.
        pedido_ids: Lista de IDs dos pedidos a consolidar.
        gestor:     Gestor que executa a consolidação.

    Returns:
        Dicionário ``{"submetidos": N}`` com o total de pedidos avançados.

    Raises:
        HTTPException 403: Perfil não autorizado a consolidar pedidos.
    """
    logger.info(
        "consolidate_pedidos → gestor=%s  total_ids=%d",
        gestor.email, len(pedido_ids),
    )

    routing = _CONSOLIDATE_ROUTING.get(gestor.perfil)
    if not routing:
        raise HTTPException(status_code=403, detail="Perfil não autorizado a consolidar pedidos")

    from_status, to_status, notify_perfil = routing
    now = datetime.now(timezone.utc)
    submetidos = 0

    for pid in pedido_ids:
        p = await db.get(Pedido, pid)
        if not p or p.status != from_status:
            logger.debug("consolidate_pedidos: ignorando pedido_id=%d (status=%s)", pid, p.status.value if p else "N/A")
            continue
        p.status = to_status
        if to_status == StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO:
            p.submetido_dsg_em = now
            p.gestor_demandante_id = gestor.id
        submetidos += 1

    await db.commit()

    label = _CONSOLIDATE_LABELS.get(gestor.perfil, "encaminhado")
    svc = NotificationService(db)
    count = await svc.notify_by_perfil(
        perfil=notify_perfil,
        titulo=f"{submetidos} pedido(s) {label}",
        mensagem=f"Gestor {gestor.nome} encaminhou {submetidos} pedido(s).",
    )
    await db.commit()

    logger.info(
        "consolidate_pedidos OK → submetidos=%d  notificados=%d  novo_status=%s",
        submetidos, count, to_status.value,
    )
    return {"submetidos": submetidos}


async def assign_cgeo(
    db: AsyncSession, pedido: Pedido, cgeo_id: int, dsg: Usuario
) -> Pedido:
    """Atribui um pedido a um CGEO para análise de viabilidade.

    Args:
        db:      Sessão assíncrona do banco de dados.
        pedido:  Pedido a atribuir (deve estar com status AGUARDANDO_CARTOGRAFICO).
        cgeo_id: ID do CGEO de destino.
        dsg:     Gestor Cartográfico que realiza a atribuição.

    Returns:
        Pedido atualizado com status ``ATRIBUIDO_CGEO``.

    Raises:
        HTTPException 400: Pedido não está aguardando atribuição.
    """
    logger.info(
        "assign_cgeo → pedido_id=%d  cgeo_id=%d  dsg=%s",
        pedido.id, cgeo_id, dsg.email,
    )

    if pedido.status != StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO:
        raise HTTPException(status_code=400, detail="Pedido não está aguardando atribuição")

    status_anterior = pedido.status
    pedido.status = StatusPedidoEnum.ATRIBUIDO_CGEO
    pedido.cgeo_id = cgeo_id
    pedido.gestor_dsg_id = dsg.id
    await registrar_historico(db, pedido, dsg, "assign_cgeo", status_anterior)

    svc = NotificationService(db)
    count = await svc.notify_by_perfil(
        perfil=PerfilEnum.ANALISTA_CGEO,
        titulo=f"Pedido #{pedido.id} atribuído ao CGEO",
        mensagem="Novo pedido para análise de viabilidade.",
        pedido_id=pedido.id,
    )
    await db.commit()
    await db.refresh(pedido)

    logger.info("assign_cgeo OK → pedido_id=%d  notificados=%d", pedido.id, count)
    return pedido


async def cgeo_review(
    db: AsyncSession,
    pedido: Pedido,
    cgeo_user: Usuario,
    acao: str,
    motivo: str | None,
    link_bdgex: str | None = None,
) -> Pedido:
    """Registra a análise de viabilidade do CGEO sobre um pedido.

    Args:
        db:         Sessão assíncrona do banco de dados.
        pedido:     Pedido em análise.
        cgeo_user:  Analista CGEO que executa a ação.
        acao:       ``"aprovar"`` | ``"reprovar"`` | ``"pronto"``.
        motivo:     Motivo obrigatório quando ``acao == "reprovar"``.
        link_bdgex: URL no BDGEx onde os dados foram disponibilizados (``"pronto"``).

    Returns:
        Pedido com status atualizado.

    Raises:
        HTTPException 400: Pedido em status incorreto ou ação inválida.
    """
    logger.info(
        "cgeo_review → pedido_id=%d  cgeo=%s  acao=%s",
        pedido.id, cgeo_user.email, acao,
    )

    usuario = await db.get(Usuario, pedido.usuario_id)
    status_anterior = pedido.status
    svc = NotificationService(db)

    if acao == "aprovar":
        if pedido.status != StatusPedidoEnum.ATRIBUIDO_CGEO:
            raise HTTPException(status_code=400, detail="Pedido não está atribuído a CGEO")
        pedido.status = StatusPedidoEnum.APROVADO
        pedido.aprovado_em = datetime.now(timezone.utc)
        if usuario:
            subject, html = pedido_aprovado(usuario.nome, pedido.id)
            await send_email(usuario.email, subject, html)

    elif acao == "reprovar":
        if pedido.status != StatusPedidoEnum.ATRIBUIDO_CGEO:
            raise HTTPException(status_code=400, detail="Pedido não está atribuído a CGEO")
        pedido.status = StatusPedidoEnum.REPROVADO
        pedido.motivo_reprovacao = motivo
        if usuario:
            subject, html = pedido_reprovado(usuario.nome, pedido.id, motivo or "Sem motivo")
            await send_email(usuario.email, subject, html)

    elif acao == "pronto":
        if pedido.status != StatusPedidoEnum.APROVADO:
            raise HTTPException(status_code=400, detail="Pedido não está em atendimento (APROVADO)")
        pedido.status = StatusPedidoEnum.PRODUZIDO
        pedido.produzido_em = datetime.now(timezone.utc)
        pedido.link_bdgex = link_bdgex
        if usuario:
            subject, html = pedido_produzido(usuario.nome, pedido.id, link_bdgex)
            await send_email(usuario.email, subject, html)
            # Notificação in-app ao solicitante
            await svc.notify_user(
                usuario_id=usuario.id,
                titulo=f"Pedido #{pedido.id} produzido — dados disponíveis no BDGEx!",
                mensagem=(
                    f"Seus dados foram entregues pelo CGEO."
                    + (f" Acesse: {link_bdgex}" if link_bdgex else "")
                ),
                pedido_id=pedido.id,
            )
        logger.info("cgeo_review pronto → pedido_id=%d  link=%s", pedido.id, link_bdgex)

    else:
        raise HTTPException(status_code=400, detail="Ação inválida")

    await registrar_historico(
        db, pedido, cgeo_user,
        f"cgeo_{acao}",
        status_anterior, motivo,
    )

    # Notifica Gestores Cartográficos sobre o desfecho
    await svc.notify_by_perfil(
        perfil=PerfilEnum.GESTOR_CARTOGRAFICO,
        titulo=f"Pedido #{pedido.id} — CGEO: {acao}",
        mensagem=f"Status: {pedido.status.value}.",
        pedido_id=pedido.id,
    )

    await db.commit()
    await db.refresh(pedido)

    logger.info("cgeo_review OK → pedido_id=%d  status=%s", pedido.id, pedido.status.value)
    return pedido


async def transferir_pedidos(
    db: AsyncSession,
    source_user: Usuario,
    novo_responsavel: Usuario,
    executor: Usuario,
) -> int:
    """Transfere todos os pedidos ativos de um usuário para outro da mesma OM.

    Pedidos transferíveis: RASCUNHO, DEVOLVIDO.

    Args:
        db:              Sessão assíncrona do banco de dados.
        source_user:     Usuário de origem dos pedidos.
        novo_responsavel: Usuário de destino (mesma OM).
        executor:        Quem disparou a transferência (para log de auditoria).

    Returns:
        Número de pedidos transferidos.

    Raises:
        HTTPException 400: Novo responsável não pertence à mesma OM.
    """
    logger.info(
        "transferir_pedidos → de=%s  para=%s  executor=%s",
        source_user.email, novo_responsavel.email, executor.email,
    )

    if source_user.om != novo_responsavel.om:
        raise HTTPException(status_code=400, detail="Novo responsável deve pertencer à mesma OM")

    transferable = {
        StatusPedidoEnum.RASCUNHO,
        StatusPedidoEnum.DEVOLVIDO,
    }
    pedidos = list(await db.scalars(
        select(Pedido).where(
            Pedido.usuario_id == source_user.id,
            Pedido.status.in_(list(transferable)),
        )
    ))

    now = datetime.now(timezone.utc)
    for p in pedidos:
        status_anterior = p.status
        p.usuario_id = novo_responsavel.id
        await registrar_historico(
            db, p, executor, "transferir", status_anterior,
            f"Transferido de {source_user.nome} para {novo_responsavel.nome}",
        )
        # Registro normalizado de transferência (rastreabilidade por pedido)
        db.add(PedidoTransferencia(
            pedido_id=p.id,
            de_usuario_id=source_user.id,
            para_usuario_id=novo_responsavel.id,
            executor_id=executor.id,
            observacao=f"Herança de solicitações — {source_user.nome} → {novo_responsavel.nome}",
            transferido_em=now,
        ))

    count = len(pedidos)
    # Marcar no perfil do cedente que a herança foi executada
    if count >= 0:  # always mark, even if 0 pedidos (user may want to change OM)
        source_user.pedidos_transferidos_em = now
    await db.commit()

    if count > 0:
        svc = NotificationService(db)
        await svc.notify_user(
            usuario_id=novo_responsavel.id,
            titulo=f"{count} pedido(s) herdado(s) de {source_user.nome}",
            mensagem=(
                f"Você recebeu {count} pedido(s) de {source_user.nome} ({source_user.om}). "
                "Verifique em Meus Pedidos."
            ),
        )
        # E-mail ao novo responsável
        await send_email(
            novo_responsavel.email,
            *pedido_transferido(novo_responsavel.nome, source_user.nome, count),
        )
        await db.commit()

    logger.info("transferir_pedidos OK → transferidos=%d", count)
    return count
