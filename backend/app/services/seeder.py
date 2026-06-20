"""Semeadores de dados iniciais executados no boot da aplicação."""

from datetime import datetime, timezone

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.enums import PerfilEnum, PostoGraduacaoEnum
from app.models.user import Usuario
from app.utils.logging_config import get_logger
from app.utils.security import get_password_hash

logger = get_logger(__name__)


async def create_admin_if_missing() -> None:
    """Cria o usuário admin (Gestor Cartográfico) se ainda não existir."""
    async with AsyncSessionLocal() as db:
        existing = await db.scalar(
            select(Usuario).where(Usuario.email == settings.ADMIN_EMAIL)
        )
        if existing:
            return

        user = Usuario(
            nome="Administrador DSG",
            nome_de_guerra="Admin",
            email=settings.ADMIN_EMAIL,
            telefone="(61) 3415-0000",
            secao_om="Seção de TI",
            om="DSG",
            perfil=PerfilEnum.GESTOR_CARTOGRAFICO,
            posto_graduacao=PostoGraduacaoEnum.CORONEL,
            senha_hash=get_password_hash(settings.ADMIN_PASSWORD),
            ativo=True,
            email_confirmado=True,
            ultima_senha_alterada=datetime.now(timezone.utc),
        )
        db.add(user)
        await db.commit()
        logger.info("Usuário admin criado: %s", settings.ADMIN_EMAIL)
