"""
Serviço de histórico de pedidos do SISGEO.

Expõe uma função simples para registrar transições de status.
Deve ser chamada **dentro da mesma transação** do serviço de pedidos,
antes do ``db.commit()``, para garantir atomicidade.

Uso::

    from app.services.historico_service import registrar_historico

    await registrar_historico(db, pedido=p, usuario=user, acao="submeter")
    await db.commit()
"""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.pedido import Pedido
from app.models.pedido_historico import PedidoHistorico
from app.models.enums import StatusPedidoEnum
from app.models.user import Usuario

logger = logging.getLogger(__name__)


async def registrar_historico(
    db: AsyncSession,
    pedido: Pedido,
    usuario: Usuario | None,
    acao: str,
    status_anterior: StatusPedidoEnum | None = None,
    motivo: str | None = None,
) -> None:
    """Cria um registro imutável de mudança de status no pedido.

    Deve ser chamada antes de ``db.commit()`` — o registro faz parte da
    mesma transação que a mudança de status, garantindo consistência.

    Args:
        db:               Sessão assíncrona do banco de dados.
        pedido:           Instância do pedido após a mudança de status.
        usuario:          Usuário que executou a ação (``None`` = sistema).
        acao:             Descrição curta da ação (ex: ``"submeter"``, ``"aprovar"``).
        status_anterior:  Status antes da ação. Se ``None``, usa ``pedido.status``
                          como novo status e ``None`` como anterior (criação).
        motivo:           Texto livre associado à ação (ex: motivo de reprovação).
    """
    entrada = PedidoHistorico(
        pedido_id=pedido.id,
        status_anterior=status_anterior,
        status_novo=pedido.status,
        usuario_id=usuario.id if usuario else None,
        acao=acao,
        motivo=motivo,
    )
    db.add(entrada)
    logger.debug(
        "historico enfileirado → pedido_id=%d  acao=%s  %s → %s",
        pedido.id, acao,
        status_anterior.value if status_anterior else "—",
        pedido.status.value,
    )
