# SisPGeo - Sistema de Pedidos de Geoinformação
# © 2026 2º Sgt Estevez Alvarez <alvarez.jean@eb.mil.br>  ·  Software Engineer
# Regras de negócio e contratos: Cap Perrut <perrut.raphael@eb.mil.br>  ·  Cartographic Engineer
# Revisão técnica do projeto: Cel Azeredo <azeredo.marcio@eb.mil.br>  ·  Cartographic Engineer

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from app.config import settings
from app.database import engine, Base, AsyncSessionLocal
from app.routers import auth, users, pedidos, operacoes, janelas, map_layers, om_data, historico, metricas, transferencias, oms
from app.routers import config as config_router
from app.middleware.metrics import metrics_middleware
from app.utils.logging_config import setup_logging, get_logger

setup_logging()
logger = get_logger(__name__)


async def _create_admin():
    """Cria o usuário admin Gestor Cartográfico na primeira inicialização."""
    from app.models.user import Usuario
    from app.models.enums import PerfilEnum, PostoGraduacaoEnum
    from app.utils.security import get_password_hash

    async with AsyncSessionLocal() as db:
        existing = await db.scalar(select(Usuario).where(Usuario.email == "admin@eb.mil.br"))
        if existing:
            return
        user = Usuario(
            nome="Administrador DSG",
            nome_de_guerra="Admin",
            email="admin@eb.mil.br",
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
        logger.info("✓ Usuário admin criado: admin@eb.mil.br")


async def _run_migrations():
    """Aplica migrações de esquema para colunas adicionadas após a criação inicial.

    Usa ``ADD COLUMN IF NOT EXISTS`` (PostgreSQL ≥ 9.6) — seguro para re-execução.
    Cada statement roda em transação isolada para que uma falha não silencie as seguintes.

    Valores de enum NÃO ficam aqui — pertencem a models/enums.py. Em novos deploys,
    ``Base.metadata.create_all`` cria os tipos PostgreSQL com todos os valores do Python
    de uma vez. Em bancos existentes, os valores já foram adicionados por execuções anteriores.
    """
    migrations = [
        "ALTER TABLE bdgex_cache ALTER COLUMN geom TYPE geometry(GEOMETRY,4326) USING geom::geometry(GEOMETRY,4326)",
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS link_bdgex TEXT",
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS criador_id INTEGER REFERENCES usuarios(id)",
        "UPDATE pedidos SET criador_id = usuario_id WHERE criador_id IS NULL",
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pedidos_transferidos_em TIMESTAMPTZ",
        "ALTER TABLE usuarios ALTER COLUMN regiao_militar TYPE VARCHAR(20)",
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS regiao_militar VARCHAR(20)",
        "UPDATE pedidos p SET regiao_militar = u.regiao_militar FROM usuarios u WHERE u.id = p.criador_id AND p.regiao_militar IS NULL",
        "ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS prioridade SMALLINT DEFAULT 0",
        "ALTER TABLE usuarios RENAME COLUMN demandante TO orgao_vinculante",
        "ALTER TABLE pedidos RENAME COLUMN demandante TO orgao_vinculante",
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone_ritex VARCHAR(10)",
        "SELECT setval('pedidos_id_seq', 999, true) WHERE (SELECT last_value FROM pedidos_id_seq) < 1000",
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN DEFAULT FALSE",
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS posto_graduacao VARCHAR(50)",
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nome_de_guerra VARCHAR(100)",
        """CREATE TABLE IF NOT EXISTS config_entrega (
            id INTEGER PRIMARY KEY DEFAULT 1,
            data_base DATE NOT NULL DEFAULT '2026-11-18',
            atualizado_em TIMESTAMPTZ DEFAULT NOW(),
            atualizado_por INTEGER REFERENCES usuarios(id)
        )""",
        "INSERT INTO config_entrega (id, data_base) VALUES (1, '2026-11-18') ON CONFLICT (id) DO NOTHING",
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS impressao_solicitada BOOLEAN DEFAULT FALSE",
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS impressao_quantidade SMALLINT",
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS impressao_tipo_material VARCHAR(20)",
        "ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS impressao_quantidade SMALLINT",
        "ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS impressao_tipo_material VARCHAR(20)",
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS finalidade_geo VARCHAR(100)",
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activation_email_sent_at TIMESTAMPTZ",
    ]
    for stmt in migrations:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
            logger.debug("Migration OK: %s", stmt[:60])
        except Exception as exc:
            logger.warning("Migration skipped (%s): %s", stmt[:40], exc)




@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.bdgex_service import preload_caches

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _run_migrations()
    # asyncpg cacheia tipos enum na conexão - descartar o pool força reconexão
    # com o cache atualizado após qualquer ALTER TYPE executado acima.
    await engine.dispose()
    await _create_admin()

    # Pré-aquece caches de grade em background - servidor sobe imediatamente.
    # Na 1ª execução: constrói os .gz a partir dos GeoJSONs e salva em disco.
    # Reinicializações: lê os .gz do disco em < 1 s por arquivo.
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

# Middleware de métricas - deve ser adicionado APÓS o CORS
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
