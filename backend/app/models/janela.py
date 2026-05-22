from datetime import datetime
from sqlalchemy import Integer, DateTime, SmallInteger, ForeignKey, UniqueConstraint, func, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.enums import TipoJanelaEnum


class JanelaPedidos(Base):
    __tablename__ = "janelas_pedidos"
    __table_args__ = (
        UniqueConstraint("tipo_janela", "ano_referencia", name="uq_janela_tipo_ano"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tipo_janela: Mapped[TipoJanelaEnum] = mapped_column(
        SAEnum(TipoJanelaEnum, name="tipo_janela_enum"), nullable=False
    )
    data_inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    data_fim: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ano_referencia: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    criado_por: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
