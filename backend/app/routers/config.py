"""Configuração global do sistema - data base de entrega e prazos mínimos por produto."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_profiles
from app.models.enums import PerfilEnum
from app.models.user import Usuario
from app.services.config_service import (
    PRAZO_DEFAULT as PRAZOS_MINIMOS,
    get_or_create_config,
    update_config,
    datas_minimas_para,
)
from app.utils.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/config", tags=["Configuração do Sistema"])


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
    cfg = await update_config(db, body.data_base, current_user.id)
    logger.info("ConfigEntrega atualizada: data_base=%s  por=%s", cfg.data_base, current_user.email)
    return ConfigEntregaOut(
        data_base=cfg.data_base,
        prazos_minimos=PRAZOS_MINIMOS,
        datas_minimas=datas_minimas_para(cfg.data_base),
        atualizado_em=cfg.atualizado_em,
    )
