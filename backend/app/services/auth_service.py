"""
Serviço de autenticação e gerenciamento de credenciais do SISGEO.

Responsável por:
- Cadastro de novos usuários com envio de e-mail de confirmação.
- Confirmação de e-mail via token.
- Autenticação com controle de tentativas e bloqueio temporário.
- Solicitação e efetivação de redefinição de senha.

Princípios aplicados:
- **SRP**: cada função cobre exatamente uma etapa do fluxo de autenticação.
- **Logging**: todas as operações sensíveis são registradas.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import TypedDict

from fastapi import HTTPException
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.enums import PerfilEnum
from app.models.user import Usuario, TokenSenha
from app.services.email_service import send_email
from app.utils.email_templates import ativacao_conta, reset_senha as tpl_reset
from app.utils.security import (
    create_access_token, generate_token, get_password_hash, verify_password,
)


class RegisterUserData(TypedDict, total=False):
    """Dados necessários para registrar um novo usuário.

    Campos obrigatórios: ``nome``, ``email``, ``telefone``, ``om``,
    ``secao_om``, ``senha``.
    Campos opcionais: ``regiao_militar``, ``orgao_vinculante``,
    ``telefone_ritex``, ``posto_graduacao``, ``nome_de_guerra``.
    """

    nome: str
    email: str
    telefone: str
    om: str
    secao_om: str
    senha: str
    regiao_militar: str | None
    orgao_vinculante: str | None
    telefone_ritex: str | None
    posto_graduacao: str | None
    nome_de_guerra: str | None

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constantes de política de segurança
# ---------------------------------------------------------------------------

LOGIN_MAX_ATTEMPTS: int = 5
"""Número máximo de tentativas de login antes do bloqueio temporário."""

LOCKOUT_MINUTES: int = 15
"""Duração do bloqueio após exceder ``LOGIN_MAX_ATTEMPTS`` (em minutos)."""

RESET_TOKEN_EXPIRY_HOURS: int = 1
"""Validade do token de redefinição de senha (em horas)."""

EMAIL_CONFIRM_TOKEN_EXPIRY_HOURS: int = 24
"""Validade do token de confirmação de e-mail (em horas)."""

MAX_RESET_TOKENS_PER_DAY: int = 3
"""Limite de tokens de redefinição gerados por usuário por dia."""

PASSWORD_EXPIRY_DAYS: int = 365
"""Prazo de expiração da senha (em dias)."""

RESEND_ACTIVATION_COOLDOWN_MINUTES: int = 30
"""Intervalo mínimo entre reenvios do link de ativação (em minutos)."""


# ---------------------------------------------------------------------------
# Funções do serviço
# ---------------------------------------------------------------------------

async def register_user(db: AsyncSession, data: RegisterUserData) -> Usuario:
    """Cadastra um novo usuário e envia e-mail de confirmação.

    O usuário é criado com perfil ``SOLICITANTE``, inativo e com e-mail
    não confirmado. A ativação ocorre apenas após clicar no link enviado.

    Args:
        db:   Sessão assíncrona do banco de dados.
        data: Dados do novo usuário (ver :class:`RegisterUserData`).

    Returns:
        Instância :class:`~app.models.user.Usuario` recém-criada.

    Raises:
        HTTPException 400: E-mail já cadastrado no sistema.
    """
    email = data["email"]
    om = data["om"]
    logger.info("register_user → email=%s  om=%s", email, om)

    existing = await db.scalar(select(Usuario).where(Usuario.email == email))
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    from app.models.enums import OrgaoVinculanteEnum
    orgao_vinculante = data.get("orgao_vinculante")
    ov = OrgaoVinculanteEnum(orgao_vinculante) if orgao_vinculante else None

    user = Usuario(
        nome=data["nome"],
        nome_de_guerra=data.get("nome_de_guerra"),
        email=email,
        telefone=data["telefone"],
        telefone_ritex=data.get("telefone_ritex"),
        om=om,
        regiao_militar=data.get("regiao_militar"),
        secao_om=data["secao_om"],
        senha_hash=get_password_hash(data["senha"]),
        perfil=PerfilEnum.SOLICITANTE,
        ativo=False,
        email_confirmado=False,
        orgao_vinculante=ov,
        posto_graduacao=data.get("posto_graduacao"),
    )
    db.add(user)
    await db.flush()

    # Gera token de ativação de e-mail (válido por 24 h)
    now = datetime.now(timezone.utc)
    token_str = generate_token()
    db.add(TokenSenha(
        usuario_id=user.id,
        token=token_str,
        expira_em=now + timedelta(hours=EMAIL_CONFIRM_TOKEN_EXPIRY_HOURS),
    ))
    await db.commit()
    await db.refresh(user)

    # Envia e-mail de ativação com link único.
    # Fire-and-forget: falha silenciosa para não bloquear o cadastro se SMTP não estiver configurado.
    try:
        subject, html = ativacao_conta(user.nome, token_str)
        await send_email(user.email, subject, html)
    except Exception as exc:
        logger.warning("register_user: falha ao enviar e-mail de ativação → %s", exc)

    logger.info("register_user OK → user_id=%d  email=%s", user.id, email)
    return user


async def confirm_email(db: AsyncSession, token: str) -> Usuario:
    """Confirma o e-mail de um usuário a partir de um token válido.

    Marca o usuário como ativo e o token como usado. Tokens expirados ou
    já utilizados são rejeitados.

    Args:
        db:    Sessão assíncrona do banco de dados.
        token: Token de confirmação recebido por e-mail.

    Returns:
        Instância :class:`~app.models.user.Usuario` ativada.

    Raises:
        HTTPException 400: Token inválido ou expirado.
        HTTPException 404: Usuário não encontrado para o token.
    """
    logger.info("confirm_email → token=%s…", token[:8])

    now = datetime.now(timezone.utc)
    token_obj = await db.scalar(
        select(TokenSenha).where(
            and_(TokenSenha.token == token, TokenSenha.usado == False, TokenSenha.expira_em > now)
        )
    )
    if not token_obj:
        raise HTTPException(status_code=400, detail="Token inválido ou expirado")

    user = await db.get(Usuario, token_obj.usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    user.email_confirmado = True
    user.ativo = True
    token_obj.usado = True
    await db.commit()

    logger.info("confirm_email OK → user_id=%d  email=%s", user.id, user.email)
    return user


async def authenticate_user(db: AsyncSession, email: str, senha: str, ip: str) -> str:
    """Autentica um usuário e retorna um JWT de acesso.

    Verifica credenciais, controla tentativas de login, aplica bloqueio
    temporário após exceder o limite e detecta senhas expiradas.

    Args:
        db:    Sessão assíncrona do banco de dados.
        email: E-mail do usuário.
        senha: Senha em texto claro.
        ip:    Endereço IP do cliente (para auditoria).

    Returns:
        Token JWT de acesso como ``str``.

    Raises:
        HTTPException 401: Credenciais inválidas.
        HTTPException 403: Conta bloqueada, não ativada ou senha expirada.
    """
    logger.info("authenticate_user → email=%s  ip=%s", email, ip)

    user = await db.scalar(select(Usuario).where(Usuario.email == email))
    if not user:
        logger.warning("authenticate_user: email não encontrado → %s", email)
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    now = datetime.now(timezone.utc)

    # Verificar bloqueio temporário
    if user.bloqueado_ate and user.bloqueado_ate.replace(tzinfo=timezone.utc) > now:
        remaining = int((user.bloqueado_ate.replace(tzinfo=timezone.utc) - now).total_seconds() / 60)
        logger.warning("authenticate_user: conta bloqueada → email=%s  restam=%dmin", email, remaining)
        raise HTTPException(
            status_code=403,
            detail=f"Conta bloqueada. Tente novamente em {remaining} minuto(s).",
        )

    # Verificar senha
    if not verify_password(senha, user.senha_hash):
        user.tentativas_login += 1
        if user.tentativas_login >= LOGIN_MAX_ATTEMPTS:
            user.bloqueado_ate = now + timedelta(minutes=LOCKOUT_MINUTES)
            user.tentativas_login = 0
            logger.warning("authenticate_user: conta bloqueada por excesso de tentativas → email=%s", email)
        await db.commit()
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    # Verificar confirmação de e-mail
    if not user.email_confirmado:
        raise HTTPException(
            status_code=403,
            detail="E-mail não confirmado. Verifique sua caixa de entrada e clique no link de ativação.",
        )
    # Verificar ativação pelo administrador
    if not user.ativo:
        raise HTTPException(status_code=403, detail="Conta pendente de ativação pelo administrador.")

    # Verificar expiração de senha
    ultima = user.ultima_senha_alterada
    if ultima is not None:
        if ultima.tzinfo is None:
            ultima = ultima.replace(tzinfo=timezone.utc)
        if (now - ultima).days >= PASSWORD_EXPIRY_DAYS:
            logger.warning("authenticate_user: senha expirada → email=%s", email)
            raise HTTPException(
                status_code=403,
                detail="Senha expirada. Por favor, redefina sua senha.",
                headers={"X-Password-Expired": "true"},
            )

    # Login bem-sucedido
    user.tentativas_login = 0
    user.bloqueado_ate = None
    await db.commit()

    token = create_access_token({
        "sub": user.email,
        "user_id": user.id,
        "perfil": user.perfil.value,
    })
    logger.info("authenticate_user OK → user_id=%d  perfil=%s", user.id, user.perfil.value)
    return token


async def request_password_reset(db: AsyncSession, email: str, ip: str) -> None:
    """Gera e envia um token de redefinição de senha por e-mail.

    Por segurança, não revela se o e-mail existe ou não na base de dados.
    Limita o número de tokens gerados por dia para evitar abuso.

    Args:
        db:    Sessão assíncrona do banco de dados.
        email: E-mail do usuário solicitante.
        ip:    Endereço IP do cliente (para auditoria).

    Raises:
        HTTPException 429: Limite diário de tokens atingido.
    """
    logger.info("request_password_reset → email=%s  ip=%s", email, ip)

    user = await db.scalar(select(Usuario).where(Usuario.email == email))
    if not user:
        # Silencioso para não revelar cadastros
        logger.debug("request_password_reset: email não encontrado → %s (silenciado)", email)
        return

    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    count = await db.scalar(
        select(func.count()).select_from(TokenSenha).where(
            and_(
                TokenSenha.usuario_id == user.id,
                TokenSenha.criado_em >= day_start,
            )
        )
    )
    if (count or 0) >= MAX_RESET_TOKENS_PER_DAY:
        logger.warning(
            "request_password_reset: limite diário atingido → email=%s  count=%d", email, count
        )
        raise HTTPException(
            status_code=429,
            detail="Limite de solicitações de redefinição atingido. Tente amanhã.",
        )

    token_str = generate_token()
    db.add(TokenSenha(
        usuario_id=user.id,
        token=token_str,
        expira_em=now + timedelta(hours=RESET_TOKEN_EXPIRY_HOURS),
    ))
    await db.commit()

    subject, html = tpl_reset(user.nome, token_str)
    await send_email(user.email, subject, html)

    logger.info("request_password_reset OK → user_id=%d  email=%s", user.id, email)


async def reset_password(db: AsyncSession, token: str, nova_senha: str) -> None:
    """Redefine a senha de um usuário a partir de um token válido.

    Args:
        db:          Sessão assíncrona do banco de dados.
        token:       Token de redefinição recebido por e-mail.
        nova_senha:  Nova senha em texto claro (será aplicado hash).

    Raises:
        HTTPException 400: Token inválido ou expirado.
        HTTPException 404: Usuário não encontrado para o token.
    """
    logger.info("reset_password → token=%s…", token[:8])

    now = datetime.now(timezone.utc)
    token_obj = await db.scalar(
        select(TokenSenha).where(
            and_(TokenSenha.token == token, TokenSenha.usado == False, TokenSenha.expira_em > now)
        )
    )
    if not token_obj:
        raise HTTPException(status_code=400, detail="Token inválido ou expirado")

    user = await db.get(Usuario, token_obj.usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    user.senha_hash = get_password_hash(nova_senha)
    user.ultima_senha_alterada = now
    token_obj.usado = True
    await db.commit()

    logger.info("reset_password OK → user_id=%d", user.id)


async def resend_activation_email(db: AsyncSession, email: str) -> None:
    """Reenvia o e-mail de ativação para um usuário com e-mail não confirmado.

    Aplica cooldown de ``RESEND_ACTIVATION_COOLDOWN_MINUTES`` entre reenvios.
    Por segurança, a resposta é sempre genérica (não revela se o e-mail existe).

    Args:
        db:    Sessão assíncrona do banco de dados.
        email: E-mail do usuário que solicita o reenvio.

    Raises:
        HTTPException 429: Cooldown de 30 minutos ainda não expirou.
    """
    logger.info("resend_activation_email → email=%s", email)

    user = await db.scalar(select(Usuario).where(Usuario.email == email))
    if not user or user.email_confirmado:
        # Silencioso: não revela se o e-mail existe ou já está confirmado
        logger.debug("resend_activation_email: noop → email=%s", email)
        return

    now = datetime.now(timezone.utc)

    # Verificar cooldown
    if user.activation_email_sent_at:
        sent_at = user.activation_email_sent_at
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=timezone.utc)
        elapsed_minutes = (now - sent_at).total_seconds() / 60
        if elapsed_minutes < RESEND_ACTIVATION_COOLDOWN_MINUTES:
            remaining = int(RESEND_ACTIVATION_COOLDOWN_MINUTES - elapsed_minutes) + 1
            logger.warning(
                "resend_activation_email: cooldown ativo → email=%s  restam=%dmin",
                email, remaining,
            )
            raise HTTPException(
                status_code=429,
                detail=f"Aguarde {remaining} minuto(s) antes de reenviar o link de ativação.",
            )

    # Gerar novo token de ativação
    token_str = generate_token()
    db.add(TokenSenha(
        usuario_id=user.id,
        token=token_str,
        expira_em=now + timedelta(hours=EMAIL_CONFIRM_TOKEN_EXPIRY_HOURS),
    ))
    user.activation_email_sent_at = now
    await db.commit()

    try:
        subject, html = ativacao_conta(user.nome, token_str)
        await send_email(user.email, subject, html)
        logger.info("resend_activation_email OK → user_id=%d  email=%s", user.id, email)
    except Exception as exc:
        logger.warning("resend_activation_email: falha ao enviar e-mail → %s", exc)
