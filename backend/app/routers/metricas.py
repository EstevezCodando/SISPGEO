"""
Router de métricas do SISGEO.

Disponibiliza dados agregados sobre o uso da API e sobre os pedidos,
exclusivamente para o Gestor Cartográfico (DSG).

Endpoints:
- ``GET /metricas/resumo``  — dashboard unificado (cards + série temporal).
- ``GET /metricas/api``     — breakdown por endpoint com latência e erros.
- ``GET /metricas/pedidos`` — distribuição e evolução dos pedidos.
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_profiles
from app.models.api_metrica import ApiMetrica
from app.models.pedido import Pedido
from app.models.enums import PerfilEnum, StatusPedidoEnum
from app.models.user import Usuario
from app.schemas.metrica import (
    ResumoMetricasOut, EndpointMetricaOut, PedidosMetricasOut,
    StatusCountOut, OrgaoVinculanteCountOut, MesCountOut, HoraMetricaOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/metricas", tags=["Métricas"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/resumo", response_model=ResumoMetricasOut)
async def resumo_metricas(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Dashboard unificado: cards de API + série temporal + pedidos por status.

    Período de referência para métricas de API: últimas 24 horas.
    """
    agora = _utcnow()
    inicio_24h = agora - timedelta(hours=24)

    # ── Métricas de API (últimas 24h) ──────────────────────────────────────
    r24 = await db.execute(
        select(
            func.count().label("total"),
            func.avg(ApiMetrica.duration_ms).label("avg_ms"),
            func.sum(
                case((ApiMetrica.status_code >= 500, 1), else_=0)
            ).label("erros"),
            func.count(ApiMetrica.endpoint.distinct()).label("endpoints"),
        ).where(ApiMetrica.criado_em >= inicio_24h)
    )
    row24 = r24.one()
    total_24h = row24.total or 0
    avg_ms = float(row24.avg_ms or 0)
    error_rate = (row24.erros or 0) / total_24h if total_24h else 0.0
    endpoints_ativos = row24.endpoints or 0

    # ── Série temporal: requests por hora nas últimas 24h ──────────────────
    hora_rows = await db.execute(
        select(
            func.date_trunc("hour", ApiMetrica.criado_em).label("hora"),
            func.count().label("total"),
            func.sum(
                case((ApiMetrica.status_code >= 400, 1), else_=0)
            ).label("erros"),
        )
        .where(ApiMetrica.criado_em >= inicio_24h)
        .group_by("hora")
        .order_by("hora")
    )
    requests_por_hora = [
        HoraMetricaOut(hora=h.hora, total=h.total, erros=int(h.erros or 0))
        for h in hora_rows
    ]

    # ── Pedidos por status ─────────────────────────────────────────────────
    status_rows = await db.execute(
        select(Pedido.status, func.count().label("cnt"))
        .group_by(Pedido.status)
        .order_by(desc("cnt"))
    )
    pedidos_por_status = [
        StatusCountOut(status=r.status.value, count=r.cnt)
        for r in status_rows
    ]
    total_pedidos = sum(s.count for s in pedidos_por_status)

    # ── Pedidos por órgão vinculante ─────────────────────────────────────
    ov_rows = await db.execute(
        select(Pedido.orgao_vinculante, func.count().label("cnt"))
        .group_by(Pedido.orgao_vinculante)
        .order_by(desc("cnt"))
    )
    pedidos_por_orgao_vinculante = [
        OrgaoVinculanteCountOut(orgao_vinculante=r.orgao_vinculante.value if r.orgao_vinculante else "—", count=r.cnt)
        for r in ov_rows
    ]

    logger.debug("resumo_metricas → total_24h=%d  avg_ms=%.1f", total_24h, avg_ms)
    return ResumoMetricasOut(
        total_requests_24h=total_24h,
        avg_response_ms=round(avg_ms, 1),
        error_rate_24h=round(error_rate, 4),
        endpoints_ativos=endpoints_ativos,
        total_pedidos=total_pedidos,
        pedidos_por_status=pedidos_por_status,
        pedidos_por_orgao_vinculante=pedidos_por_orgao_vinculante,
        requests_por_hora=requests_por_hora,
    )


@router.get("/api", response_model=list[EndpointMetricaOut])
async def metricas_api(
    horas: int = Query(24, ge=1, le=720, description="Janela temporal em horas"),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Breakdown por endpoint: volume, latência e taxa de erros.

    Args:
        horas: Janela de análise em horas (1–720, padrão 24).
    """
    inicio = _utcnow() - timedelta(hours=horas)

    rows = await db.execute(
        select(
            ApiMetrica.endpoint,
            ApiMetrica.method,
            func.count().label("total"),
            func.avg(ApiMetrica.duration_ms).label("avg_ms"),
            func.max(ApiMetrica.duration_ms).label("max_ms"),
            func.percentile_cont(0.95).within_group(
                ApiMetrica.duration_ms
            ).label("p95_ms"),
            func.sum(
                case((ApiMetrica.status_code >= 400, 1), else_=0)
            ).label("erros"),
            func.max(ApiMetrica.criado_em).label("last_called"),
        )
        .where(ApiMetrica.criado_em >= inicio)
        .group_by(ApiMetrica.endpoint, ApiMetrica.method)
        .order_by(desc("total"))
    )

    result = []
    for r in rows:
        total = r.total or 1
        erros = int(r.erros or 0)
        result.append(EndpointMetricaOut(
            endpoint=r.endpoint,
            method=r.method,
            total_requests=r.total,
            avg_duration_ms=round(float(r.avg_ms or 0), 1),
            max_duration_ms=round(float(r.max_ms or 0), 1),
            p95_duration_ms=round(float(r.p95_ms or 0), 1),
            error_count=erros,
            error_rate=round(erros / total, 4),
            last_called=r.last_called,
        ))

    logger.debug("metricas_api → endpoints=%d  janela=%dh", len(result), horas)
    return result


@router.get("/pedidos", response_model=PedidosMetricasOut)
async def metricas_pedidos(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Métricas de negócio dos pedidos: distribuição, evolução mensal e SLA.

    Inclui cálculo do tempo médio de tramitação entre criação e aprovação.
    """
    # Por status
    status_rows = await db.execute(
        select(Pedido.status, func.count().label("cnt"))
        .group_by(Pedido.status)
        .order_by(desc("cnt"))
    )
    pedidos_por_status = [
        StatusCountOut(status=r.status.value, count=r.cnt) for r in status_rows
    ]
    total = sum(s.count for s in pedidos_por_status)

    # Por órgão vinculante
    ov_rows = await db.execute(
        select(Pedido.orgao_vinculante, func.count().label("cnt"))
        .group_by(Pedido.orgao_vinculante)
        .order_by(desc("cnt"))
    )
    pedidos_por_orgao_vinculante = [
        OrgaoVinculanteCountOut(
            orgao_vinculante=r.orgao_vinculante.value if r.orgao_vinculante else "—",
            count=r.cnt
        )
        for r in ov_rows
    ]

    # Evolução mensal (últimos 12 meses)
    mes_rows = await db.execute(
        select(
            func.to_char(Pedido.criado_em, "YYYY-MM").label("mes"),
            func.count().label("cnt"),
        )
        .where(Pedido.criado_em >= _utcnow() - timedelta(days=365))
        .group_by("mes")
        .order_by("mes")
    )
    evolucao_mensal = [MesCountOut(mes=r.mes, count=r.cnt) for r in mes_rows]

    # Tempo médio de tramitação (criado_em → aprovado_em) em horas
    tramit_row = await db.execute(
        select(
            func.avg(
                func.extract("epoch", Pedido.aprovado_em - Pedido.criado_em) / 3600
            ).label("avg_horas")
        )
        .where(Pedido.aprovado_em.is_not(None))
    )
    avg_horas_row = tramit_row.scalar()
    tempo_medio = round(float(avg_horas_row), 1) if avg_horas_row else None

    logger.debug("metricas_pedidos → total=%d  avg_tramit=%.1fh", total, tempo_medio or 0)
    return PedidosMetricasOut(
        total_pedidos=total,
        pedidos_por_status=pedidos_por_status,
        pedidos_por_orgao_vinculante=pedidos_por_orgao_vinculante,
        evolucao_mensal=evolucao_mensal,
        tempo_medio_tramitacao_horas=tempo_medio,
    )
