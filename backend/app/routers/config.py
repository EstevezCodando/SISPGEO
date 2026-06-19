"""Configuração global do sistema - data base de entrega e prazos mínimos por produto."""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_profiles
from app.models.config_entrega import ConfigEntrega
from app.models.enums import PerfilEnum
from app.models.user import Usuario
from app.utils.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/config", tags=["Configuração do Sistema"])

# ── Prazos mínimos de produção por produto (dias a partir da data_base) ────────
PRAZOS_MINIMOS: dict[str, int] = {
    "CARTA_TOPOGRAFICA": 180,
    "CDGV":              180,
    "CARTA_ORTOIMAGEM":   60,
    "ORTOIMAGEM":          40,
    "MDT":                 40,
    "MDS":                 40,
    "IMPRESSAO":           30,
}

# Data base padrão (alterável pelo admin via PUT /config/entrega)
DATA_BASE_PADRAO = date(2026, 11, 18)


# ── Helpers ───────────────────────────────────────────────────────────────────

def datas_minimas_para(data_base: date) -> dict[str, str]:
    """Retorna {produto: data_minima_iso} calculado sobre a data_base."""
    return {
        produto: (data_base + timedelta(days=prazo)).isoformat()
        for produto, prazo in PRAZOS_MINIMOS.items()
    }


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


# ── Schemas ───────────────────────────────────────────────────────────────────

class ConfigEntregaOut(BaseModel):
    data_base: date
    prazos_minimos: dict[str, int]
    datas_minimas: dict[str, str]
    atualizado_em: datetime | None = None
    model_config = {"from_attributes": True}


class ConfigEntregaUpdate(BaseModel):
    data_base: date


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/ano", response_model=dict)
async def get_ano_referencia(db: AsyncSession = Depends(get_db)):
    """Retorna o ano de referência do PIT (público, sem autenticação)."""
    cfg = await get_or_create_config(db)
    return {"ano": cfg.data_base.year}


@router.get("/entrega", response_model=ConfigEntregaOut)
async def get_config_entrega(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Retorna data base de entrega e prazos mínimos por produto (autenticado)."""
    cfg = await get_or_create_config(db)
    return ConfigEntregaOut(
        data_base=cfg.data_base,
        prazos_minimos=PRAZOS_MINIMOS,
        datas_minimas=datas_minimas_para(cfg.data_base),
        atualizado_em=cfg.atualizado_em,
    )


@router.put("/entrega", response_model=ConfigEntregaOut)
async def update_config_entrega(
    body: ConfigEntregaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Atualiza a data base global de entrega (somente Gestor Cartográfico / DSG)."""
    if body.data_base < date.today():
        raise HTTPException(
            status_code=422,
            detail="A data base de entrega não pode ser no passado.",
        )
    cfg = await get_or_create_config(db)
    cfg.data_base = body.data_base
    cfg.atualizado_em = datetime.now(timezone.utc)
    cfg.atualizado_por = current_user.id
    await db.commit()
    await db.refresh(cfg)
    logger.info(
        "ConfigEntrega atualizada: data_base=%s  por=%s",
        cfg.data_base, current_user.email,
    )
    return ConfigEntregaOut(
        data_base=cfg.data_base,
        prazos_minimos=PRAZOS_MINIMOS,
        datas_minimas=datas_minimas_para(cfg.data_base),
        atualizado_em=cfg.atualizado_em,
    )
