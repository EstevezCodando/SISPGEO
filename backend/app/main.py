# SisPGeo - Sistema de Pedidos de Geoinformação
# © 2026 2º Sgt Estevez Alvarez <alvarez.jean@eb.mil.br>  ·  Software Engineer
# Regras de negócio e contratos: Cap Perrut <perrut.raphael@eb.mil.br>  ·  Cartographic Engineer
# Revisão técnica do projeto: Cel Azeredo <azeredo.marcio@eb.mil.br>  ·  Cartographic Engineer

import asyncio
import os
from contextlib import asynccontextmanager

from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

from app.config import settings
from app.database import engine, Base
from app.routers import auth, users, pedidos, operacoes, janelas, map_layers, om_data, historico, metricas, transferencias, oms
from app.routers import config as config_router
from app.middleware.metrics import metrics_middleware
from app.services.seeder import create_admin_if_missing
from app.utils.logging_config import setup_logging, get_logger

setup_logging()
logger = get_logger(__name__)

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ALEMBIC_INI = os.path.join(_BACKEND_DIR, "alembic.ini")
_SYNC_URL = (
    f"postgresql+psycopg2://{settings.DB_USER}:{settings.DB_PASSWORD}"
    f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"
)


def _alembic_sync() -> None:
    """Garante que Alembic está sincronizado com o banco (síncrono — roda em executor).

    Primeira subida após introdução do Alembic:
      - Banco com tabelas mas sem alembic_version → stampa 0001 (baseline histórico).
    Subidas subsequentes:
      - alembic_version presente → aplica migrações pendentes normalmente.
    Banco novo (create_all acabou de criar o schema):
      - Também sem alembic_version → stampa 0001 (create_all já criou tudo correto).
    """
    cfg = AlembicConfig(_ALEMBIC_INI)
    sync_engine = create_engine(_SYNC_URL, poolclass=NullPool)

    try:
        with sync_engine.connect() as conn:
            has_version_table = conn.execute(text(
                "SELECT EXISTS("
                "  SELECT 1 FROM information_schema.tables"
                "  WHERE table_name = 'alembic_version'"
                ")"
            )).scalar()

        if not has_version_table:
            alembic_command.stamp(cfg, "0001")
            logger.info("Alembic: banco stampado como baseline (0001)")
            return

        alembic_command.upgrade(cfg, "head")

    finally:
        sync_engine.dispose()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.bdgex_service import preload_caches

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _alembic_sync)

    # asyncpg cacheia tipos enum na conexão — descarta o pool para reconectar
    # com o cache atualizado após qualquer ALTER TYPE das migrações.
    await engine.dispose()

    await create_admin_if_missing()

    # Pré-aquece caches de grade em background — servidor sobe imediatamente.
    asyncio.create_task(preload_caches())

    yield


app = FastAPI(
    title="SisPGeo - Sistema de Pedidos de Geoinformação",
    version="0.1.0",
    docs_url="/api/docs" if settings.ENV == "development" else None,
    redoc_url="/api/redoc" if settings.ENV == "development" else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.ENV == "development" else [settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware de métricas — deve ser adicionado APÓS o CORS
app.middleware("http")(metrics_middleware)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(pedidos.router, prefix="/api/v1")
app.include_router(operacoes.router, prefix="/api/v1")
app.include_router(janelas.router, prefix="/api/v1")
app.include_router(map_layers.router, prefix="/api/v1")
app.include_router(om_data.router, prefix="/api/v1")
app.include_router(historico.router, prefix="/api/v1")
app.include_router(metricas.router, prefix="/api/v1")
app.include_router(transferencias.router, prefix="/api/v1")
app.include_router(oms.router, prefix="/api/v1")
app.include_router(config_router.router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "version": app.version}
