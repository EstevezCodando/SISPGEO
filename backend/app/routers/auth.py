"""
Router de autenticação do SISGEO.

Endpoints públicos (sem autenticação) para registro, confirmação de
e-mail, login e redefinição de senha.
"""

import logging
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_client_ip
from app.models.audit_log import AuditLog
from app.models.user import Usuario
from app.schemas.auth import (
    ForgotPasswordRequest, LoginRequest, RegisterRequest,
    ResendActivationRequest, ResetPasswordRequest, TokenResponse,
)
from app.services import auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", status_code=201)
async def register(
    body: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Cadastra um novo usuário e envia e-mail de confirmação.

    O usuário fica inativo até confirmar o e-mail via link recebido.
    Apenas e-mails ``@eb.mil.br`` são aceitos (validação no schema).

    Args:
        body: Dados do novo usuário (nome, e-mail, senha, OM etc.).
    """
    ip = get_client_ip(request)
    logger.info("POST /auth/register → email=%s  ip=%s", body.email, ip)

    user = await auth_service.register_user(
        db, body.nome, body.email, body.telefone,
        body.om, body.secao_om, body.senha,
        body.regiao_militar, body.orgao_vinculante,
        body.telefone_ritex, body.posto_graduacao,
        body.nome_de_guerra,
    )
    db.add(AuditLog(
        usuario_id=user.id,
        acao="register",
        ip_address=ip,
        dados_extras={"email": user.email},
    ))
    await db.commit()
    return {"message": "Cadastro realizado. Verifique seu email para ativar a conta."}


@router.get("/confirm-email/{token}")
async def confirm_email(token: str, db: AsyncSession = Depends(get_db)):
    """Confirma o e-mail do usuário a partir do token recebido por e-mail.

    Args:
        token: Token de 64 caracteres gerado no cadastro.
    """
    logger.info("GET /auth/confirm-email → token=%s…", token[:8])
    user = await auth_service.confirm_email(db, token)
    return {"message": f"Email confirmado. Bem-vindo, {user.nome}!"}


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Autentica o usuário e retorna um token JWT de acesso.

    Controla tentativas de login e bloqueia a conta temporariamente
    após exceder o limite de tentativas.

    Args:
        body: E-mail e senha do usuário.
    """
    ip = get_client_ip(request)
    logger.info("POST /auth/login → email=%s  ip=%s", body.email, ip)

    access_token = await auth_service.authenticate_user(db, body.email, body.senha, ip)

    user = await db.scalar(select(Usuario).where(Usuario.email == body.email))
    db.add(AuditLog(
        usuario_id=user.id if user else None,
        acao="login",
        ip_address=ip,
    ))
    await db.commit()
    return TokenResponse(access_token=access_token)


@router.post("/resend-activation", status_code=200)
async def resend_activation(
    body: ResendActivationRequest,
    db: AsyncSession = Depends(get_db),
):
    """Reenvia o e-mail de ativação para um usuário com e-mail não confirmado.

    Aplica cooldown de 30 minutos entre reenvios. A resposta é sempre genérica
    por segurança (não revela se o e-mail existe ou já está confirmado).

    Args:
        body: E-mail do usuário que solicita o reenvio.
    """
    logger.info("POST /auth/resend-activation → email=%s", body.email)
    await auth_service.resend_activation_email(db, body.email)
    return {"message": "Se o e-mail estiver cadastrado e pendente de confirmação, o link foi reenviado."}


@router.post("/forgot-password", status_code=200)
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Solicita redefinição de senha por e-mail.

    Por segurança, sempre retorna 200 mesmo que o e-mail não exista.

    Args:
        body: E-mail do usuário que deseja redefinir a senha.
    """
    ip = get_client_ip(request)
    logger.info("POST /auth/forgot-password → email=%s  ip=%s", body.email, ip)
    await auth_service.request_password_reset(db, body.email, ip)
    return {"message": "Se o email estiver cadastrado, você receberá as instruções de redefinição."}


@router.post("/reset-password", status_code=200)
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Redefine a senha do usuário usando o token recebido por e-mail.

    Args:
        body: Token de redefinição e nova senha.
    """
    logger.info("POST /auth/reset-password → token=%s…", body.token[:8])
    await auth_service.reset_password(db, body.token, body.nova_senha)
    return {"message": "Senha redefinida com sucesso."}
