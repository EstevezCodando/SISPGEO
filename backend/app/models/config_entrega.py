from datetime import date, datetime
from sqlalchemy import Integer, Date, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ConfigEntrega(Base):
    """Configuração global de data base para entrega de pedidos (singleton — id=1)."""
    __tablename__ = "config_entrega"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    data_base: Mapped[date] = mapped_column(Date, nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    atualizado_por: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id"), nullable=True
    )
