"""
Router: /oms — OMs customizadas pelos usuários.

GET  /oms/{cmila}    → lista OMs customizadas para o comando de área
POST /oms            → salva nova OM (ignora duplicatas)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, field_validator

from app.database import get_db
from app.models.om_customizada import OmCustomizada
from app.dependencies import get_current_user
from app.models.user import Usuario

router = APIRouter(prefix="/oms", tags=["oms"])

CMILA_VALIDOS = {"CMA", "CMAO", "CML", "CMP", "CMO", "CMS", "CMNE", "CMSE"}


class OmCreateRequest(BaseModel):
    cmila: str
    nome: str

    @field_validator("cmila")
    @classmethod
    def cmila_valido(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in CMILA_VALIDOS:
            raise ValueError(f"cmila inválido: {v}")
        return v

    @field_validator("nome")
    @classmethod
    def nome_valido(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("nome não pode ser vazio")
        if len(v) > 200:
            raise ValueError("nome muito longo (máx 200 caracteres)")
        return v


@router.get("/{cmila}", response_model=list[str])
async def listar_oms_customizadas(
    cmila: str,
    db: AsyncSession = Depends(get_db),
    _current_user: Usuario = Depends(get_current_user),
):
    cmila = cmila.strip().upper()
    if cmila not in CMILA_VALIDOS:
        raise HTTPException(status_code=400, detail=f"cmila inválido: {cmila}")

    result = await db.execute(
        select(OmCustomizada.nome)
        .where(OmCustomizada.cmila == cmila)
        .order_by(OmCustomizada.nome)
    )
    return result.scalars().all()


@router.post("", status_code=201, response_model=dict)
async def criar_om_customizada(
    body: OmCreateRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: Usuario = Depends(get_current_user),
):
    # Verifica duplicata (case-insensitive)
    result = await db.execute(
        select(OmCustomizada).where(
            OmCustomizada.cmila == body.cmila,
            OmCustomizada.nome == body.nome,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return {"created": False, "nome": existing.nome}

    nova = OmCustomizada(cmila=body.cmila, nome=body.nome)
    db.add(nova)
    await db.commit()
    await db.refresh(nova)
    return {"created": True, "nome": nova.nome}
