"""
Registro normalizado de eventos de herança/transferência de pedidos.

Cada instância representa UM evento de transferência de UM pedido entre dois usuários.
A tabela satisfaz:
  - 1NF: atributos atômicos, sem grupos repetitivos
  - 2NF: todos os não-chave dependem da chave inteira (id)
  - 3NF: sem dependências transitivas — cada coluna descreve o evento de transferência
  - BCNF: todo determinante é chave candidata

Relação com ``pedido_historico``:
  - ``pedido_historico`` registra ações atômicas por pedido (baixo nível)
  - ``pedido_transferencias`` registra o evento de negócio completo (nível agregado)
    e permite consultar "quem herdou de quem" diretamente com índices eficientes.
"""
from datetime import datetime
from sqlalchemy import Integer, ForeignKey, DateTime, Text, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class PedidoTransferencia(Base):
    __tablename__ = "pedido_transferencias"
    __table_args__ = (
        Index("ix_pt_pedido_id", "pedido_id"),
        Index("ix_pt_de_usuario_id", "de_usuario_id"),
        Index("ix_pt_para_usuario_id", "para_usuario_id"),
        Index("ix_pt_transferido_em", "transferido_em"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Pedido que foi transferido
    pedido_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("pedidos.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Usuário anterior (cedente) — preservado mesmo se usuario for deletado
    de_usuario_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
    )
    # Usuário que recebeu (herdeiro)
    para_usuario_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
    )
    # Quem executou a ação (pode ser o próprio cedente ou um GESTOR_DSG)
    executor_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
    )
    # Observação livre (motivo, contexto)
    observacao: Mapped[str | None] = mapped_column(Text)

    # Momento exato da transferência (imutável após inserção)
    transferido_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
