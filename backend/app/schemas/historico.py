"""Schemas Pydantic para o histórico de pedidos."""

from datetime import datetime
from pydantic import BaseModel
from app.models.enums import StatusPedidoEnum


class PedidoHistoricoOut(BaseModel):
    """Representação de um evento no histórico de um pedido."""

    id: int
    pedido_id: int
    status_anterior: StatusPedidoEnum | None
    status_novo: StatusPedidoEnum
    usuario_id: int | None
    usuario_nome: str | None = None
    acao: str
    motivo: str | None
    criado_em: datetime

    model_config = {"from_attributes": True}
