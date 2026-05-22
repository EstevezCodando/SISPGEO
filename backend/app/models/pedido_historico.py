"""
Modelo ORM para o histórico de mudanças de status dos pedidos.

Toda transição de status gera um registro imutável nesta tabela, criando
um audit trail completo do ciclo de vida de cada pedido.
"""

from datetime import datetime, timezone
from sqlalchemy import Integer, DateTime, ForeignKey, Text, String, Enum as SAEnum, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.enums import StatusPedidoEnum


class PedidoHistorico(Base):
    """Registro imutável de uma transição de status de pedido.

    Cada linha corresponde exatamente a uma ação sobre o pedido.
    A tabela nunca é atualizada — apenas inserida e consultada.
    """

    __tablename__ = "pedido_historico"
    __table_args__ = (
        Index("ix_pedido_historico_pedido_id", "pedido_id"),
        Index("ix_pedido_historico_criado_em", "criado_em"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    pedido_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("pedidos.id", ondelete="CASCADE"),
        nullable=False,
    )
    """FK para o pedido ao qual este registro pertence."""

    status_anterior: Mapped[str | None] = mapped_column(
        SAEnum(StatusPedidoEnum, name="status_pedido_enum"),
        nullable=True,
    )
    """Status imediatamente antes da ação (None = pedido recém-criado)."""

    status_novo: Mapped[str] = mapped_column(
        SAEnum(StatusPedidoEnum, name="status_pedido_enum"),
        nullable=False,
    )
    """Status após a ação."""

    usuario_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
    )
    """Usuário que executou a ação (None = sistema)."""

    acao: Mapped[str] = mapped_column(String(60), nullable=False)
    """Ação executada. Valores esperados: criar, submeter, aprovar, reprovar,
    editar, cancelar, consolidar, assign_cgeo, cgeo_aprovar, cgeo_reprovar."""

    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    """Motivo ou observação associada à ação (ex: motivo de reprovação)."""

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    """Timestamp UTC da ação — imutável após a inserção."""
