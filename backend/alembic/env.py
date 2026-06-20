"""Alembic environment — usa psycopg2 (síncrono) separado do asyncpg do runtime.

Fluxo de uso:
- Criar migração:  alembic revision --autogenerate -m "descricao"
- Aplicar:         alembic upgrade head
- Ver estado:      alembic current
- Histórico:       alembic history
"""
import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Garante que o pacote app/ está no path quando rodado via CLI
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.database import Base

# Importa todos os modelos para que Base.metadata fique completa antes do autogenerate
import app.models  # noqa: F401 — side-effect import intencional

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    """URL síncrona (psycopg2) para uso exclusivo das migrações Alembic.

    O runtime usa asyncpg — esta URL é apenas para o processo de migração.
    """
    return (
        f"postgresql+psycopg2://{settings.DB_USER}:{settings.DB_PASSWORD}"
        f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"
    )


def run_migrations_offline() -> None:
    """Gera SQL sem conectar ao banco (útil para revisar antes de aplicar)."""
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Conecta ao banco e aplica migrações pendentes."""
    connectable = engine_from_config(
        {"sqlalchemy.url": get_url()},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
