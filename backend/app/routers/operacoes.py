from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, field_validator
from app.database import get_db
from app.dependencies import get_current_user
from app.models.operacao import Operacao
from app.models.user import Usuario

router = APIRouter(prefix="/operacoes", tags=["Operações"])


class OperacaoCreate(BaseModel):
    nome: str

    @field_validator("nome")
    @classmethod
    def validate_nome(cls, v: str) -> str:
        v = v.strip()
        if len(v) > 100:
            raise ValueError("Nome deve ter no máximo 100 caracteres")
        if len(v) < 2:
            raise ValueError("Nome deve ter ao menos 2 caracteres")
        return v


class OperacaoOut(BaseModel):
    id: int
    nome: str
    om: str
    model_config = {"from_attributes": True}


@router.get("/", response_model=list[OperacaoOut])
async def list_operacoes(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    result = await db.scalars(
        select(Operacao)
        .where(Operacao.om == current_user.om)
        .order_by(Operacao.nome)
    )
    return list(result)


@router.post("/", response_model=OperacaoOut, status_code=201)
async def create_operacao(
    body: OperacaoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    op = Operacao(nome=body.nome, om=current_user.om, criado_por=current_user.id)
    db.add(op)
    await db.commit()
    await db.refresh(op)
    return op
