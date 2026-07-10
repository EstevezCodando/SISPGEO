from datetime import datetime, date
from sqlalchemy import String, Integer, DateTime, Date, ForeignKey, Text, Boolean, SmallInteger, func, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry
from app.database import Base
from app.models.enums import StatusPedidoEnum, TipoProdutoEnum, EscalaEnum, OrgaoVinculanteEnum


class Pedido(Base):
    __tablename__ = "pedidos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    # criador_id: imutável — registra quem fez a solicitação originalmente,
    # mesmo após transferência de responsabilidade (usuario_id pode mudar).
    criador_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("usuarios.id"))
    operacao_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("operacoes.id"))
    data_entrega: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[StatusPedidoEnum] = mapped_column(
        SAEnum(StatusPedidoEnum, name="status_pedido_enum"),
        nullable=False,
        default=StatusPedidoEnum.RASCUNHO,
        index=True,
    )
    prioridade: Mapped[int] = mapped_column(SmallInteger, default=0)
    finalidade: Mapped[str | None] = mapped_column(Text)
    finalidade_geo: Mapped[str | None] = mapped_column(String(100))
    orgao_vinculante: Mapped[OrgaoVinculanteEnum] = mapped_column(
        SAEnum(OrgaoVinculanteEnum, name="orgao_vinculante_enum"),
        nullable=False,
    )
    # FKs para múltiplos usuários — sem relationship para evitar ambiguidade async
    gestor_demandante_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("usuarios.id"))
    gestor_dsg_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("usuarios.id"))
    cgeo_id: Mapped[int | None] = mapped_column(Integer)
    motivo_reprovacao: Mapped[str | None] = mapped_column(Text)
    observacoes: Mapped[str | None] = mapped_column(Text)
    submetido_gestor_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submetido_dsg_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    aprovado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    produzido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    link_bdgex: Mapped[str | None] = mapped_column(Text)
    # True quando o pedido foi submetido automaticamente pelo sistema no fim da janela
    auto_submitted: Mapped[bool] = mapped_column(Boolean, default=False)
    # Região Militar do solicitante — usada para rotear pedidos ao supervisor (C. Mil. A)
    # vinculado por RM. Consolidador e acima usam o campo orgao_vinculante.
    regiao_militar: Mapped[str | None] = mapped_column(String(20))
    # Diretoria supervisora do DECEx (DESMIL/DETMIL/DEPA/DPHCEX/CCFEX) — análoga a
    # regiao_militar, porém para o fluxo DECEx: roteia o pedido ao supervisor da
    # Diretoria. Preenchida apenas quando orgao_vinculante == DECEx.
    diretoria: Mapped[str | None] = mapped_column(String(20))
    # Impressão solicitada junto ao pedido
    impressao_solicitada: Mapped[bool] = mapped_column(Boolean, default=False)
    impressao_quantidade: Mapped[int | None] = mapped_column(SmallInteger)
    impressao_tipo_material: Mapped[str | None] = mapped_column(String(20))
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relacionamentos com selectin para evitar lazy loading proibido em async
    itens: Mapped[list["ItemPedido"]] = relationship(
        "ItemPedido", back_populates="pedido", cascade="all, delete-orphan",
        lazy="selectin",
    )


class ItemPedido(Base):
    __tablename__ = "itens_pedido"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pedido_id: Mapped[int] = mapped_column(Integer, ForeignKey("pedidos.id", ondelete="CASCADE"), nullable=False)
    tipo_produto: Mapped[TipoProdutoEnum] = mapped_column(
        SAEnum(TipoProdutoEnum, name="tipo_produto_enum"), nullable=False
    )
    escala: Mapped[EscalaEnum] = mapped_column(
        SAEnum(EscalaEnum, name="escala_enum"), nullable=False
    )
    inom: Mapped[str] = mapped_column(String(50), nullable=False)
    mi: Mapped[str | None] = mapped_column(String(50))
    geom: Mapped[object | None] = mapped_column(Geometry("POLYGON", srid=4326))
    disponivel_bdgex: Mapped[bool] = mapped_column(Boolean, default=False)
    data_producao_bdgex: Mapped[date | None] = mapped_column(Date)
    solicitar_mesmo_disponivel: Mapped[bool] = mapped_column(Boolean, default=False)
    prioridade: Mapped[int] = mapped_column(SmallInteger, default=0)
    impressao_quantidade: Mapped[int | None] = mapped_column(SmallInteger)
    impressao_tipo_material: Mapped[str | None] = mapped_column(String(20))
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    pedido: Mapped["Pedido"] = relationship("Pedido", back_populates="itens")
