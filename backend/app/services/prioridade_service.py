"""Prioridade de encaminhamento — carimbo definitivo, sequencial e sem reuso.

Modelo em duas camadas, para separar o que é rascunho do que é decisão:

``Pedido.ordem_fila``
    Ordem de trabalho do escalão que **detém** o pedido agora. É o que o
    arrastar-e-soltar altera, quantas vezes o gestor quiser. Não vale nada fora
    da fila dele.

``Pedido.prioridade``
    Prioridade **definitiva** atribuída pelo escalão que encaminhou o pedido.
    Carimbada no envio, na ordem da fila, continuando a sequência daquele
    escalão. Nunca é reescrita por arrasto — é o que o escalão seguinte lê.

``prioridades_encaminhamento``
    Histórico completo: todo carimbo de todo escalão fica registrado, então a
    DSG consegue ver que o solicitante pediu como 3 e o consolidador enviou
    como 1.

O bug que motivou este módulo: o arrasto gravava ``1..N`` sobre a fila pendente
visível. Ao encaminhar uma leva, ela saía da fila — e a leva seguinte
reaproveitava os mesmos números. Em produção isso levou 4 pedidos distintos à
prioridade 1, e os pedidos 1006 e 1020 à prioridade 8.
"""

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import CONSOLIDADOR_PROFILES, PerfilEnum, SUPERVISOR_PROFILES
from app.models.pedido import Pedido
from app.models.prioridade import PrioridadeEncaminhamento
from app.models.user import Usuario

logger = logging.getLogger(__name__)


def escopo_de(user: Usuario) -> str:
    """Chave da sequência de prioridades do escalão a que o usuário pertence.

    Supervisores e consolidadores têm uma sequência por perfil (há um de cada
    por C. Mil. A / órgão). O solicitante tem a sua própria.
    """
    if user.perfil in SUPERVISOR_PROFILES or user.perfil in CONSOLIDADOR_PROFILES:
        return user.perfil.value
    return f"{PerfilEnum.SOLICITANTE.value}:{user.id}"


def escalao_de(user: Usuario) -> str:
    """Rótulo do nível hierárquico, usado na exibição da cadeia."""
    if user.perfil in SUPERVISOR_PROFILES:
        return "SUPERVISOR"
    if user.perfil in CONSOLIDADOR_PROFILES:
        return "CONSOLIDADOR"
    if user.perfil == PerfilEnum.GESTOR_CARTOGRAFICO:
        return "GESTOR_CARTOGRAFICO"
    return "SOLICITANTE"


async def ciclo_atual(db: AsyncSession) -> int:
    """Ano de referência do PIT — a sequência de prioridades reinicia a cada ciclo."""
    from app.routers.config import get_or_create_config

    cfg = await get_or_create_config(db)
    return cfg.data_base.year


async def _ultima_prioridade(db: AsyncSession, escopo: str, ciclo: int) -> int:
    """Maior prioridade já consumida por este escalão neste ciclo (0 se nenhuma)."""
    maior = await db.scalar(
        select(func.max(PrioridadeEncaminhamento.prioridade)).where(
            PrioridadeEncaminhamento.escopo == escopo,
            PrioridadeEncaminhamento.ciclo == ciclo,
        )
    )
    return maior or 0


async def carimbar_encaminhamento(
    db: AsyncSession,
    pedidos: list[Pedido],
    remetente: Usuario,
) -> dict[int, int]:
    """Atribui prioridade definitiva a uma leva que está sendo encaminhada.

    Os pedidos são numerados na ordem em que chegam nesta lista — que é a ordem
    da fila do remetente —, continuando de onde o último envio parou. Um número
    já consumido jamais é reaproveitado.

    Args:
        db:        Sessão assíncrona (o commit fica a cargo do chamador).
        pedidos:   Pedidos da leva, já ordenados pela fila do remetente.
        remetente: Quem está encaminhando.

    Returns:
        Mapa ``{pedido_id: prioridade_atribuida}``.
    """
    if not pedidos:
        return {}

    escopo = escopo_de(remetente)
    escalao = escalao_de(remetente)
    ciclo = await ciclo_atual(db)
    proximo = await _ultima_prioridade(db, escopo, ciclo) + 1

    atribuidas: dict[int, int] = {}
    for pedido in pedidos:
        pedido.prioridade = proximo
        # A fila do escalão seguinte começa na ordem que este remetente definiu.
        pedido.ordem_fila = proximo
        db.add(
            PrioridadeEncaminhamento(
                pedido_id=pedido.id,
                escopo=escopo,
                escalao=escalao,
                ciclo=ciclo,
                prioridade=proximo,
                definida_por_id=remetente.id,
            )
        )
        atribuidas[pedido.id] = proximo
        proximo += 1

    logger.info(
        "carimbar_encaminhamento → escopo=%s ciclo=%d pedidos=%d faixa=%d..%d",
        escopo, ciclo, len(pedidos),
        min(atribuidas.values()), max(atribuidas.values()),
    )
    return atribuidas


async def historico_de(
    db: AsyncSession, pedido_ids: list[int]
) -> dict[int, list[PrioridadeEncaminhamento]]:
    """Histórico de prioridades dos pedidos, do escalão mais antigo ao mais recente."""
    if not pedido_ids:
        return {}
    registros = await db.scalars(
        select(PrioridadeEncaminhamento)
        .where(PrioridadeEncaminhamento.pedido_id.in_(pedido_ids))
        .order_by(PrioridadeEncaminhamento.definida_em.asc())
    )
    historico: dict[int, list[PrioridadeEncaminhamento]] = {}
    for r in registros:
        historico.setdefault(r.pedido_id, []).append(r)
    return historico
