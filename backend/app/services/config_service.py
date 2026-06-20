"""Serviço de configuração global do sistema.

Fonte única de verdade para prazos mínimos de produção por produto e para a
:class:`~app.models.config_entrega.ConfigEntrega` (singleton id=1 no banco).

Outros módulos devem importar daqui — nunca duplicar as constantes.
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.config_entrega import ConfigEntrega
from app.utils.logging_config import get_logger

logger = get_logger(__name__)

# ── Fonte única de verdade: prazos mínimos por produto (dias a partir da data_base) ──

PRAZO_DEFAULT: dict[str, int] = {
    "CARTA_TOPOGRAFICA": 180,
    "CDGV":              180,
    "CARTA_ORTOIMAGEM":   60,
    "ORTOIMAGEM":          40,
    "MDT":                 40,
    "MDS":                 40,
    "IMPRESSAO":           30,
}

# Data base padrão (alterável pelo admin via PUT /config/entrega)
DATA_BASE_PADRAO: date = date(2026, 11, 18)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def get_or_create_config(db: AsyncSession) -> ConfigEntrega:
    """Retorna a config global (singleton id=1), criando com valor padrão se ausente."""
    cfg = await db.get(ConfigEntrega, 1)
    if cfg is None:
        cfg = ConfigEntrega(id=1, data_base=DATA_BASE_PADRAO)
        db.add(cfg)
        await db.commit()
        await db.refresh(cfg)
        logger.info("ConfigEntrega inicializada com data_base=%s", DATA_BASE_PADRAO)
    return cfg


async def update_config(
    db: AsyncSession,
    data_base: date,
    user_id: int,
) -> "ConfigEntrega":
    """Persiste a nova data base e retorna a config atualizada."""
    cfg = await get_or_create_config(db)
    cfg.data_base = data_base
    cfg.atualizado_em = datetime.now(timezone.utc)
    cfg.atualizado_por = user_id
    await db.commit()
    await db.refresh(cfg)
    logger.info("ConfigEntrega atualizada: data_base=%s  user_id=%s", data_base, user_id)
    return cfg


def datas_minimas_para(data_base: date) -> dict[str, str]:
    """Retorna {produto: data_minima_iso} calculado sobre a data_base."""
    return {
        produto: (data_base + timedelta(days=prazo)).isoformat()
        for produto, prazo in PRAZO_DEFAULT.items()
    }
