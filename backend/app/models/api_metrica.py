"""
Modelo ORM para métricas de uso da API.

Cada requisição HTTP à API gera um registro aqui, permitindo análise de
volume, latência e taxa de erros por endpoint.

Os registros são criados assincronamente pelo middleware e nunca bloqueiam
o fluxo principal da requisição.
"""

from datetime import datetime
from sqlalchemy import Integer, DateTime, Float, String, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ApiMetrica(Base):
    """Registro de uma requisição HTTP processada pela API.

    Gerado automaticamente pelo :mod:`~app.middleware.metrics` para cada
    endpoint (exceto health check e documentação).
    """

    __tablename__ = "api_metricas"
    __table_args__ = (
        Index("ix_api_metricas_endpoint_method", "endpoint", "method"),
        Index("ix_api_metricas_criado_em", "criado_em"),
        Index("ix_api_metricas_status_code", "status_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    method: Mapped[str] = mapped_column(String(10), nullable=False)
    """Método HTTP (GET, POST, PUT, DELETE…)."""

    endpoint: Mapped[str] = mapped_column(String(200), nullable=False)
    """Path normalizado do endpoint (ex: ``/api/v1/pedidos/{pedido_id}``)."""

    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    """Código HTTP da resposta."""

    duration_ms: Mapped[float] = mapped_column(Float, nullable=False)
    """Tempo de processamento em milissegundos."""

    usuario_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    """ID do usuário autenticado, se aplicável."""

    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    """Endereço IP do cliente."""

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    """Timestamp UTC da requisição."""
