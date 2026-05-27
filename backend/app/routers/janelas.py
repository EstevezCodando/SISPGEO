from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.dependencies import get_current_user, require_profiles
from app.models.janela import JanelaPedidos
from app.models.user import Usuario
from app.models.enums import PerfilEnum, TipoJanelaEnum, SUPERVISOR_PROFILES, CONSOLIDADOR_PROFILES
from app.services.notification_service import NotificationService
from app.utils.logging_config import get_logger

logger = get_logger(__name__)

# Qual perfil superior recebe a solicitação de prorrogação
# Fluxo: SOLICITANTE → SUPERVISOR → CONSOLIDADOR → GESTOR_CARTOGRAFICO
_PRORROGACAO_SUPERIOR: dict[PerfilEnum, PerfilEnum] = {
    PerfilEnum.SOLICITANTE:  PerfilEnum.SUPERVISOR,
    PerfilEnum.SUPERVISOR:   PerfilEnum.CONSOLIDADOR,
    PerfilEnum.CONSOLIDADOR: PerfilEnum.GESTOR_CARTOGRAFICO,
}

# Mapeamento perfil → tipo de janela que controla seu acesso
def _get_tipo_janela(perfil: PerfilEnum) -> TipoJanelaEnum | None:
    """Retorna o TipoJanela que restringe o perfil, ou None se irrestrito."""
    if perfil == PerfilEnum.SOLICITANTE:
        return TipoJanelaEnum.SOLICITANTE
    if perfil in SUPERVISOR_PROFILES:
        return TipoJanelaEnum.SUPERVISOR
    if perfil in CONSOLIDADOR_PROFILES:
        return TipoJanelaEnum.CONSOLIDADOR
    return None  # GESTOR_CARTOGRAFICO, ANALISTA_CGEO — nunca bloqueados por janela

# Ordem cronológica para validação de datas entre etapas
_ORDEM_JANELAS = [
    TipoJanelaEnum.SOLICITANTE,
    TipoJanelaEnum.SUPERVISOR,
    TipoJanelaEnum.CONSOLIDADOR,
    TipoJanelaEnum.GESTOR_CARTOGRAFICO,
    TipoJanelaEnum.ANALISTA_CGEO,
]

router = APIRouter(prefix="/janelas", tags=["Janelas de Pedidos"])


class JanelaCreate(BaseModel):
    tipo_janela: TipoJanelaEnum
    data_inicio: datetime
    data_fim: datetime
    ano_referencia: int


class JanelaUpdate(BaseModel):
    data_inicio: datetime
    data_fim: datetime


class JanelaOut(BaseModel):
    id: int
    tipo_janela: TipoJanelaEnum
    data_inicio: datetime
    data_fim: datetime
    ano_referencia: int
    model_config = {"from_attributes": True}


class MinhaJanelaOut(BaseModel):
    aberta: bool
    data_inicio: datetime | None = None
    data_fim: datetime | None = None
    tipo_janela: str | None = None
    dias_restantes: int | None = None
    configurada: bool = False


@router.get("/minha-janela", response_model=MinhaJanelaOut)
async def minha_janela(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Retorna o status da janela de solicitações do usuário autenticado.

    Perfis DSG/CGEO nunca são bloqueados por janela (retornam aberta=True).
    """
    tipo_janela = _get_tipo_janela(current_user.perfil)

    # Gestores cartográficos e analistas CGEO têm acesso irrestrito
    if tipo_janela is None:
        return MinhaJanelaOut(aberta=True, configurada=True)

    now = datetime.now(timezone.utc)

    result = await db.scalars(
        select(JanelaPedidos)
        .where(JanelaPedidos.tipo_janela == tipo_janela)
        .order_by(JanelaPedidos.data_inicio.desc())
    )
    janelas = list(result)

    if not janelas:
        return MinhaJanelaOut(
            aberta=False,
            tipo_janela=tipo_janela.value,
            configurada=False,
        )

    # Prioriza janela ativa; senão pega a mais recente (passada ou futura)
    ativa = next((j for j in janelas if j.data_inicio <= now <= j.data_fim), None)
    janela = ativa or janelas[0]

    aberta = janela.data_inicio <= now <= janela.data_fim
    dias_restantes: int | None = None
    if aberta:
        delta = janela.data_fim - now
        dias_restantes = max(0, delta.days)

    return MinhaJanelaOut(
        aberta=aberta,
        data_inicio=janela.data_inicio,
        data_fim=janela.data_fim,
        tipo_janela=tipo_janela.value,
        dias_restantes=dias_restantes,
        configurada=True,
    )


@router.get("/", response_model=list[JanelaOut])
async def list_janelas(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Lista todas as janelas de pedidos cadastradas, ordenadas por data de início."""
    result = await db.scalars(select(JanelaPedidos).order_by(JanelaPedidos.data_inicio))
    return list(result)


@router.get("/active", response_model=list[JanelaOut])
async def active_janelas(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Retorna as janelas de pedidos ativas no momento da requisição."""
    now = datetime.now(timezone.utc)
    result = await db.scalars(
        select(JanelaPedidos).where(
            JanelaPedidos.data_inicio <= now,
            JanelaPedidos.data_fim >= now,
        )
    )
    return list(result)


@router.post("/", response_model=JanelaOut, status_code=201)
async def create_janela(
    body: JanelaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Cria uma nova janela temporal de pedidos (somente Gestor Cartográfico / DSG).

    Valida que janelas de etapas posteriores começam ao menos 1 dia após o
    encerramento da etapa anterior (para o mesmo ano de referência).
    """
    # Validação: janela da etapa posterior deve começar >= etapa_anterior.data_fim + 1 dia
    if body.tipo_janela in _ORDEM_JANELAS:
        idx = _ORDEM_JANELAS.index(body.tipo_janela)
        if idx > 0:
            predecessor = _ORDEM_JANELAS[idx - 1]
            pred_janela = await db.scalar(
                select(JanelaPedidos).where(
                    JanelaPedidos.tipo_janela == predecessor,
                    JanelaPedidos.ano_referencia == body.ano_referencia,
                )
            )
            if pred_janela is not None:
                min_start = pred_janela.data_fim + timedelta(days=1)
                if body.data_inicio < min_start:
                    raise HTTPException(
                        status_code=422,
                        detail=(
                            f"A janela de {body.tipo_janela.value} deve iniciar ao menos 1 dia após o "
                            f"encerramento da janela de {predecessor.value} "
                            f"({pred_janela.data_fim.strftime('%d/%m/%Y')}). "
                            f"Data mínima: {min_start.strftime('%d/%m/%Y')}."
                        ),
                    )

    janela = JanelaPedidos(
        tipo_janela=body.tipo_janela,
        data_inicio=body.data_inicio,
        data_fim=body.data_fim,
        ano_referencia=body.ano_referencia,
        criado_por=current_user.id,
    )
    db.add(janela)
    await db.commit()
    await db.refresh(janela)
    logger.info("Janela criada: tipo=%s  ano=%d  por=%s", body.tipo_janela, body.ano_referencia, current_user.email)
    return janela


@router.put("/{janela_id}", response_model=JanelaOut)
async def update_janela(
    janela_id: int,
    body: JanelaUpdate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Atualiza as datas de uma janela existente (somente Gestor Cartográfico / DSG)."""
    janela = await db.get(JanelaPedidos, janela_id)
    if not janela:
        raise HTTPException(status_code=404, detail="Janela não encontrada")
    if body.data_fim <= body.data_inicio:
        raise HTTPException(status_code=422, detail="Data de encerramento deve ser posterior à abertura")
    janela.data_inicio = body.data_inicio
    janela.data_fim = body.data_fim
    await db.commit()
    await db.refresh(janela)
    logger.info("Janela atualizada: id=%d  tipo=%s  inicio=%s  fim=%s",
                janela_id, janela.tipo_janela, body.data_inicio, body.data_fim)
    return janela


class ProrrogacaoRequest(BaseModel):
    justificativa: str
    produtos_desejados: str


@router.post("/solicitar-prorrogacao", status_code=201)
async def solicitar_prorrogacao(
    body: ProrrogacaoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Envia solicitação de prorrogação de prazo ao escalão superior."""
    superior_perfil = _PRORROGACAO_SUPERIOR.get(current_user.perfil)
    if not superior_perfil:
        raise HTTPException(status_code=403, detail="Perfil não autorizado a solicitar prorrogação")

    titulo = f"Solicitação de prorrogação de prazo — {current_user.nome} ({current_user.om})"
    mensagem = (
        f"O usuário {current_user.nome} ({current_user.om}) solicita prorrogação do prazo de submissão.\n\n"
        f"Justificativa: {body.justificativa}\n\n"
        f"Produtos desejados: {body.produtos_desejados}"
    )

    orgao_vinculante = (
        current_user.orgao_vinculante
        if superior_perfil != PerfilEnum.GESTOR_CARTOGRAFICO
        else None
    )
    svc = NotificationService(db)
    count = await svc.notify_by_perfil(
        perfil=superior_perfil,
        titulo=titulo,
        mensagem=mensagem,
        orgao_vinculante=orgao_vinculante,
    )

    if count == 0:
        raise HTTPException(status_code=404, detail="Nenhum gestor superior encontrado para notificar")

    await db.commit()
    logger.info(
        "Prorrogação solicitada por %s → perfil_superior=%s  notificados=%d",
        current_user.email, superior_perfil.value, count,
    )
    return {"detail": f"Solicitação enviada a {count} gestor(es) superior(es)"}


@router.delete("/{janela_id}")
async def delete_janela(
    janela_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Remove uma janela de pedidos (somente Gestor Cartográfico / DSG)."""
    janela = await db.get(JanelaPedidos, janela_id)
    if not janela:
        raise HTTPException(status_code=404, detail="Janela não encontrada")
    await db.delete(janela)
    await db.commit()
    logger.info("Janela removida: id=%d  tipo=%s", janela_id, janela.tipo_janela)
    return {"message": "Janela removida"}
