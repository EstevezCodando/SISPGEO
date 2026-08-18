from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PrioridadeEncaminhamento(Base):
    """Prioridade definitiva que um escalão atribuiu a um pedido ao encaminhá-lo.

    Cada escalão da cadeia (solicitante → supervisor → consolidador) carimba a
    sua própria prioridade no momento do envio. O registro é imutável: uma vez
    encaminhado na prioridade 4, aquele número está consumido para sempre
    naquele escalão e naquele ciclo, e o próximo envio continua em 5.

    É a constraint ``uq_prioridade_escopo_ciclo`` que garante essa regra no
    banco — não basta a lógica da aplicação, porque envios concorrentes de dois
    pedidos poderiam calcular o mesmo "próximo número" antes de qualquer commit.
    """

    __tablename__ = "prioridades_encaminhamento"
    __table_args__ = (
        # Um número de prioridade nunca se repete dentro do mesmo escalão/ciclo.
        UniqueConstraint("escopo", "ciclo", "prioridade", name="uq_prioridade_escopo_ciclo"),
        # Um pedido recebe no máximo uma prioridade por escalão/ciclo.
        UniqueConstraint("pedido_id", "escopo", "ciclo", name="uq_prioridade_pedido_escopo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pedido_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pedidos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Chave da sequência: identifica quem prioriza.
    #   SOLICITANTE:<user_id> · SUPERVISOR_CMP · CONSOLIDADOR_DSG · …
    escopo: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    # Rótulo do nível, para exibição na cadeia ("SOLICITANTE"/"SUPERVISOR"/"CONSOLIDADOR").
    escalao: Mapped[str] = mapped_column(String(20), nullable=False)
    # Ano de referência do PIT — a sequência reinicia a cada ciclo anual.
    ciclo: Mapped[int] = mapped_column(Integer, nullable=False)
    prioridade: Mapped[int] = mapped_column(Integer, nullable=False)
    definida_por_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("usuarios.id"))
    definida_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
