from datetime import datetime, date
from sqlalchemy import String, Boolean, Date, DateTime, UniqueConstraint, func, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from geoalchemy2 import Geometry
from app.database import Base
from app.models.enums import TipoProdutoEnum, EscalaEnum


class BdgexCache(Base):
    """Rastreamento de disponibilidade de produto por INOM/escala no BDGEx.

    A geometria (geom) pode ser populada por jobs de sincronização futuros.
    A pipeline de exibição da grade INOM usa cache em disco - não esta tabela.
    """
    __tablename__ = "bdgex_cache"
    __table_args__ = (
        UniqueConstraint("inom", "tipo_produto", "escala", name="uq_bdgex_inom_tipo_escala"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    inom: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    tipo_produto: Mapped[TipoProdutoEnum] = mapped_column(
        SAEnum(TipoProdutoEnum, name="tipo_produto_enum"), nullable=False
    )
    escala: Mapped[EscalaEnum] = mapped_column(
        SAEnum(EscalaEnum, name="escala_enum"), nullable=False
    )
    disponivel: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    data_producao: Mapped[date | None] = mapped_column(Date)
    em_producao: Mapped[bool] = mapped_column(Boolean, default=False)
    geom: Mapped[object | None] = mapped_column(Geometry("GEOMETRY", srid=4326))
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
