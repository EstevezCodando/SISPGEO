from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.dependencies import get_current_user, require_profiles
from app.models.user import Usuario
from app.models.notificacao import Notificacao
from app.models.enums import PerfilEnum
from app.schemas.user import (
    UsuarioOut, UsuarioUpdateRequest, ChangePasswordRequest,
    UpdateProfileRequest, NotificacaoOut
)
from app.schemas.pedido import TransferirPedidosRequest
from app.utils.security import verify_password, get_password_hash
from app.services import pedido_service
from app.services.email_service import send_email
from app.utils.email_templates import conta_ativada as tpl_conta_ativada

router = APIRouter(prefix="/users", tags=["Usuários"])


@router.get("/me", response_model=UsuarioOut)
async def get_me(current_user: Usuario = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UsuarioOut)
async def update_me(
    body: UsuarioUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if body.telefone is not None:
        current_user.telefone = body.telefone
    if body.secao_om is not None:
        current_user.secao_om = body.secao_om
    if body.posto_graduacao is not None:
        current_user.posto_graduacao = body.posto_graduacao
    # OM e Região Militar só podem ser alterados após a herança ser executada
    if body.om is not None or body.regiao_militar is not None:
        if current_user.pedidos_transferidos_em is None:
            from fastapi import HTTPException as _HTTPException
            raise _HTTPException(
                status_code=400,
                detail="Execute a herança de solicitações antes de alterar OM ou Região Militar.",
            )
        if body.om is not None:
            current_user.om = body.om
        if body.regiao_militar is not None:
            current_user.regiao_militar = body.regiao_militar
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.put("/me/password")
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if not verify_password(body.senha_atual, current_user.senha_hash):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")
    current_user.senha_hash = get_password_hash(body.nova_senha)
    current_user.ultima_senha_alterada = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Senha alterada com sucesso"}


@router.post("/me/confirm-data")
async def confirm_data(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    current_user.ultima_confirmacao_dados = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Dados confirmados"}


@router.get("/me/notifications/unread-count")
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Retorna apenas o número de notificações não lidas — endpoint leve para polling."""
    count = await db.scalar(
        select(func.count()).select_from(Notificacao)
        .where(Notificacao.usuario_id == current_user.id, Notificacao.lida == False)
    )
    return {"unread": count or 0}


@router.get("/me/notifications", response_model=list[NotificacaoOut])
async def get_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    result = await db.scalars(
        select(Notificacao)
        .where(Notificacao.usuario_id == current_user.id)
        .order_by(Notificacao.criado_em.desc())
        .limit(50)
    )
    return list(result)


@router.put("/me/notifications/{notif_id}/read")
async def mark_read(
    notif_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    notif = await db.get(Notificacao, notif_id)
    if not notif or notif.usuario_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    notif.lida = True
    await db.commit()
    return {"message": "Notificação marcada como lida"}


@router.get("/mesma-om", response_model=list[UsuarioOut])
async def list_mesma_om(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Retorna todos os usuários ativos da mesma OM do usuário logado (exceto ele mesmo).

    Usado na tela de herança de pedidos para listar candidatos a herdeiro.
    Qualquer perfil autenticado pode acessar — filtragem por OM garante o escopo.
    """
    result = await db.scalars(
        select(Usuario)
        .where(
            Usuario.om == current_user.om,
            Usuario.id != current_user.id,
            Usuario.ativo == True,
        )
        .order_by(Usuario.nome)
    )
    return list(result)


@router.get("/", response_model=list[UsuarioOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    result = await db.scalars(select(Usuario).order_by(Usuario.nome))
    return list(result)


@router.put("/{user_id}/profile")
async def update_profile(
    user_id: int,
    body: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    user = await db.get(Usuario, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    user.perfil = body.perfil
    user.orgao_vinculante = body.orgao_vinculante
    user.cgeo_id = body.cgeo_id
    await db.commit()
    return {"message": "Perfil atualizado"}


@router.post("/{user_id}/transferir-pedidos")
async def transferir_pedidos(
    user_id: int,
    body: TransferirPedidosRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Transfere todos os pedidos ativos do usuário ``user_id`` para outro da mesma OM.

    Somente o próprio usuário ou um GESTOR_CARTOGRAFICO podem disparar a transferência.
    Os pedidos no estado RASCUNHO serão reatribuídos.
    O novo responsável recebe notificação in-app e e-mail.
    """
    if current_user.id != user_id and current_user.perfil != PerfilEnum.GESTOR_CARTOGRAFICO:
        raise HTTPException(status_code=403, detail="Acesso negado")

    source_user = await db.get(Usuario, user_id)
    if not source_user:
        raise HTTPException(status_code=404, detail="Usuário de origem não encontrado")

    novo = await db.get(Usuario, body.novo_responsavel_id)
    if not novo:
        raise HTTPException(status_code=404, detail="Novo responsável não encontrado")

    count = await pedido_service.transferir_pedidos(db, source_user, novo, current_user)
    return {"transferidos": count, "novo_responsavel": novo.nome}


@router.put("/{user_id}/activate")
async def toggle_activate(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    user = await db.get(Usuario, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    foi_inativo = not user.ativo
    user.ativo = not user.ativo

    # Ativação administrativa equivale à confirmação por e-mail:
    # garante que o usuário não seja barrado na tela de login por
    # "E-mail não confirmado" mesmo sem ter clicado no link de ativação.
    if user.ativo:
        user.email_confirmado = True

    await db.commit()

    if foi_inativo and user.ativo:
        try:
            subject, html = tpl_conta_ativada(user.nome, user.email)
            await send_email(user.email, subject, html)
        except Exception:
            pass  # falha de e-mail não reverte a ativação

    return {"message": f"Usuário {'ativado' if user.ativo else 'desativado'}"}
