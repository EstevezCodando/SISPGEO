from datetime import datetime
from sqlalchemy import String, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class OmCustomizada(Base):
    """OM inserida manualmente por um usuário e disponibilizada para todos."""
    __tablename__ = "oms_customizadas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cmila: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
