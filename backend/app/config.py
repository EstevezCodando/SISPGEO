from pydantic_settings import BaseSettings
from typing import Literal


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://coter_user:coter_secret@db:5432/coter"
    SECRET_KEY: str = "changeme_super_secret_key_minimum_32_chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Resend — https://resend.com
    RESEND_API_KEY: str = "re_aARZvKmj_MQGJ1to1oDSs1pnWCmy3agoD"
    RESEND_FROM: str = "onboarding@resend.dev"   # domínio verificado em produção

    # SMTP legado (mantido para compatibilidade — ignorado quando RESEND_API_KEY definido)
    SMTP_HOST: str = "mailpit"
    SMTP_PORT: int = 1025
    SMTP_FROM: str = "noreply@eb.mil.br"
    SMTP_TLS: bool = False
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    BDGEX_API_URL: str = "http://bdgex.eb.mil.br/api"
    BDGEX_MOCK: bool = True

    FRONTEND_URL: str = "http://localhost"
    ENV: Literal["development", "production"] = "development"

    class Config:
        env_file = ".env"


settings = Settings()
