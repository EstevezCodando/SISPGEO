from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Operacao(Base):
    __tablename__ = "operacoes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    om: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    criado_por: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
