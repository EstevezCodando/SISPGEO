"""Schemas Pydantic para as métricas da API e dos pedidos."""

from datetime import datetime
from pydantic import BaseModel


class EndpointMetricaOut(BaseModel):
    """Métricas agregadas por endpoint."""

    endpoint: str
    method: str
    total_requests: int
    avg_duration_ms: float
    max_duration_ms: float
    p95_duration_ms: float
    error_count: int
    error_rate: float          # 0.0 – 1.0
    last_called: datetime | None


class HoraMetricaOut(BaseModel):
    """Contagem de requisições por hora (para gráfico de linha/barras)."""

    hora: datetime
    total: int
    erros: int


class StatusCountOut(BaseModel):
    """Contagem de pedidos por status."""

    status: str
    count: int


class OrgaoVinculanteCountOut(BaseModel):
    """Contagem de pedidos por órgão vinculante (COTER, COLOG, etc.)."""

    orgao_vinculante: str
    count: int


# Alias de compatibilidade (pode ser removido futuramente)
DemandanteCountOut = OrgaoVinculanteCountOut


class MesCountOut(BaseModel):
    """Evolução mensal de pedidos criados."""

    mes: str    # "2025-05"
    count: int


class ResumoMetricasOut(BaseModel):
    """Resumo geral para o dashboard de métricas."""

    # API
    total_requests_24h: int
    avg_response_ms: float
    error_rate_24h: float
    endpoints_ativos: int

    # Pedidos
    total_pedidos: int
    pedidos_por_status: list[StatusCountOut]
    pedidos_por_orgao_vinculante: list[OrgaoVinculanteCountOut]

    # Série temporal
    requests_por_hora: list[HoraMetricaOut]


class PedidosMetricasOut(BaseModel):
    """Métricas detalhadas dos pedidos."""

    total_pedidos: int
    pedidos_por_status: list[StatusCountOut]
    pedidos_por_orgao_vinculante: list[OrgaoVinculanteCountOut]
    evolucao_mensal: list[MesCountOut]
    tempo_medio_tramitacao_horas: float | None
