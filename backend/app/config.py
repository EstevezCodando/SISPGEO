import sys
from pydantic_settings import BaseSettings
from pydantic import model_validator
from typing import Literal

# Valor sentinela — nunca deve chegar a produção
_INSECURE_KEY = "changeme_super_secret_key_minimum_32_chars"


class Settings(BaseSettings):
    # Componentes individuais do banco — usados para construir DATABASE_URL com
    # encoding correto de caracteres especiais na senha (ex.: @, #, %).
    DB_HOST: str = "db"
    DB_PORT: int = 5432
    DB_USER: str = "sispgeo_user"
    DB_PASSWORD: str = "sispgeo_secret"
    DB_NAME: str = "sispgeo"
    DATABASE_URL: str = ""  # construído pelo validator abaixo

    SECRET_KEY: str = _INSECURE_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Senha do usuário admin inicial — DEVE ser sobrescrita via .env em produção
    ADMIN_PASSWORD: str = "Admin@1234"

    # Resend — deixe vazio para usar SMTP
    # NUNCA coloque o valor real aqui; use variável de ambiente RESEND_API_KEY
    RESEND_API_KEY: str = ""
    RESEND_FROM: str = "noreply@sispgeo.br"

    # SMTP — Zimbra em produção (ignorado quando RESEND_API_KEY estiver definido)
    SMTP_HOST: str = "smtp.webmail.eb.mil.br"
    SMTP_PORT: int = 587
    SMTP_FROM: str = "sispgeo@sispgeo.br"
    SMTP_TLS: bool = False
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    # Mailpit — captura de e-mails em development
    MAILPIT_HOST: str = "mailpit"
    MAILPIT_PORT: int = 1025

    BDGEX_API_URL: str = "http://bdgex.eb.mil.br/api"
    # CRÍTICO: manter False em produção — True cria usuários de teste com senhas conhecidas
    BDGEX_MOCK: bool = False

    FRONTEND_URL: str = "http://localhost"
    ENV: Literal["development", "production"] = "development"

    class Config:
        env_file = ".env"

    @model_validator(mode="after")
    def build_database_url(self) -> "Settings":
        from sqlalchemy.engine.url import URL
        self.DATABASE_URL = str(
            URL.create(
                drivername="postgresql+asyncpg",
                username=self.DB_USER,
                password=self.DB_PASSWORD,
                host=self.DB_HOST,
                port=self.DB_PORT,
                database=self.DB_NAME,
            )
        )
        return self

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        """Impede inicialização com valores inseguros em produção."""
        if self.ENV != "production":
            return self

        errors: list[str] = []

        if self.SECRET_KEY == _INSECURE_KEY:
            errors.append(
                "SECRET_KEY está com valor padrão inseguro. "
                "Gere uma chave com: openssl rand -hex 32"
            )

        if len(self.SECRET_KEY) < 32:
            errors.append("SECRET_KEY deve ter no mínimo 32 caracteres.")

        if self.ADMIN_PASSWORD == "Admin@1234":
            errors.append(
                "ADMIN_PASSWORD está com valor padrão. "
                "Defina uma senha forte via variável de ambiente."
            )

        if self.BDGEX_MOCK:
            errors.append(
                "BDGEX_MOCK=true em produção cria usuários de teste com senhas "
                "conhecidas. Defina BDGEX_MOCK=false."
            )

        if errors:
            print("\n[SISGEO] ERRO DE CONFIGURAÇÃO DE SEGURANÇA:", file=sys.stderr)
            for e in errors:
                print(f"  ✗ {e}", file=sys.stderr)
            print(
                "\nO sistema não pode iniciar em modo produção com configurações inseguras.\n",
                file=sys.stderr,
            )
            sys.exit(1)

        return self


settings = Settings()
