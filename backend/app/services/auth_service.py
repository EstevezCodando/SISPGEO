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

from fastapi import HTTPException
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.enums import PerfilEnum
from app.models.user import Usuario, TokenSenha
from app.services.email_service import send_email
from app.utils.email_templates import cadastro_recebido, reset_senha as tpl_reset
from app.utils.security import (
    create_access_token, generate_token, get_password_hash, verify_password,
)

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


# ---------------------------------------------------------------------------
# Funções do serviço
# ---------------------------------------------------------------------------

async def register_user(
    db: AsyncSession,
    nome: str,
    email: str,
    telefone: str,
    om: str,
    secao_om: str,
    senha: str,
    regiao_militar: str | None = None,
    orgao_vinculante: str | None = None,
    telefone_ritex: str | None = None,
    posto_graduacao: str | None = None,
) -> Usuario:
    """Cadastra um novo usuário e envia e-mail de confirmação.

    O usuário é criado com perfil ``SOLICITANTE``, inativo e com e-mail
    não confirmado. A ativação ocorre apenas após clicar no link enviado.

    Args:
        db:                Sessão assíncrona do banco de dados.
        nome:              Nome completo do usuário.
        email:             E-mail institucional (``@eb.mil.br``).
        telefone:          Telefone de contato.
        om:                Organização Militar de lotação.
        secao_om:          Seção dentro da OM.
        senha:             Senha em texto claro (será aplicado hash).
        regiao_militar:    Região Militar de lotação (opcional).
        orgao_vinculante:  Órgão vinculante do usuário (opcional).

    Returns:
        Instância :class:`~app.models.user.Usuario` recém-criada.

    Raises:
        HTTPException 400: E-mail já cadastrado no sistema.
    """
    logger.info("register_user → email=%s  om=%s", email, om)

    existing = await db.scalar(select(Usuario).where(Usuario.email == email))
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    from app.models.enums import OrgaoVinculanteEnum
    ov = OrgaoVinculanteEnum(orgao_vinculante) if orgao_vinculante else None

    user = Usuario(
        nome=nome,
        email=email,
        telefone=telefone,
        telefone_ritex=telefone_ritex,
        om=om,
        regiao_militar=regiao_militar,
        secao_om=secao_om,
        senha_hash=get_password_hash(senha),
        perfil=PerfilEnum.SOLICITANTE,
        ativo=False,
        email_confirmado=True,   # Confirmação de e-mail não é exigida — admin ativa o usuário.
        orgao_vinculante=ov,
        posto_graduacao=posto_graduacao,
    )
    db.add(user)
    await db.flush()
    await db.commit()
    await db.refresh(user)

    # Envia e-mail de boas-vindas informando que o cadastro aguarda ativação pelo admin.
    # Fire-and-forget: falha silenciosa para não bloquear o cadastro se SMTP não estiver configurado.
    try:
        subject, html = cadastro_recebido(user.nome, user.email)
        await send_email(user.email, subject, html)
    except Exception as exc:
        logger.warning("register_user: falha ao enviar e-mail de boas-vindas → %s", exc)

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

    # Verificar ativação — confirmação de e-mail não é exigida; basta o admin ativar o usuário.
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
