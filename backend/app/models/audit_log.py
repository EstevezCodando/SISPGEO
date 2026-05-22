from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, BigInteger, JSON, func
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"))
    acao: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entidade: Mapped[str | None] = mapped_column(String(100))
    entidade_id: Mapped[int | None] = mapped_column(Integer)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    dados_extras: Mapped[dict | None] = mapped_column(JSON)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
