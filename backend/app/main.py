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
from app.routers import prioridades
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

    Usa ``ADD COLUMN IF NOT EXISTS`` (PostgreSQL ≥ 9.6) - seguro para re-execução.

    Migrações DDL de enum (ALTER TYPE ADD VALUE) são executadas em modo AUTOCOMMIT
    separado, pois o PostgreSQL não permite esse comando dentro de blocos de
    transação que já contêm outros statements.
    """
    # ── Migrações transacionais - cada uma em transação própria ────────────────
    # IMPORTANTE: rodar em transações isoladas garante que um RENAME que já foi
    # aplicado (e falha) não coloca toda a sessão PostgreSQL em estado de erro,
    # o que silenciaria as migrações subsequentes.
    migrations = [
        # 2026-05: ampliar tipo de geometria de POLYGON para GEOMETRY (suporta MultiPolygon)
        "ALTER TABLE bdgex_cache ALTER COLUMN geom TYPE geometry(GEOMETRY,4326) USING geom::geometry(GEOMETRY,4326)",
        # 2026-05: link do produto disponibilizado pelo CGEO no BDGEx
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS link_bdgex TEXT",
        # 2026-05: criador original do pedido (imutável, pode diferir de usuario_id após transferência)
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS criador_id INTEGER REFERENCES usuarios(id)",
        # 2026-05: backfill criador_id = usuario_id para pedidos criados antes desta migração
        "UPDATE pedidos SET criador_id = usuario_id WHERE criador_id IS NULL",
        # 2026-05: data em que o usuário executou a herança de pedidos (desbloqueia mudança de OM)
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pedidos_transferidos_em TIMESTAMPTZ",
        # 2026-05: ampliar regiao_militar para acomodar "12ª RM" (6 chars UTF-8)
        "ALTER TABLE usuarios ALTER COLUMN regiao_militar TYPE VARCHAR(20)",
        # 2026-05: regiao_militar em pedidos - roteamento para supervisor intermediário (C. Mil. A)
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS regiao_militar VARCHAR(20)",
        # backfill: preenche regiao_militar a partir do usuario que criou o pedido
        "UPDATE pedidos p SET regiao_militar = u.regiao_militar FROM usuarios u WHERE u.id = p.criador_id AND p.regiao_militar IS NULL",
        # 2026-05: prioridade de item dentro do pedido
        "ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS prioridade SMALLINT DEFAULT 0",
        "ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS removido BOOLEAN DEFAULT FALSE",
        # 2026-05: renomear coluna demandante → orgao_vinculante em usuarios
        "ALTER TABLE usuarios RENAME COLUMN demandante TO orgao_vinculante",
        # 2026-05: renomear coluna demandante → orgao_vinculante em pedidos
        "ALTER TABLE pedidos RENAME COLUMN demandante TO orgao_vinculante",
        # 2026-05: telefone Ritex (NNN-NNNN) nos usuários
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone_ritex VARCHAR(10)",
        # 2026-05: IDs de pedidos iniciam em 1000 (sequência só avança se ainda estiver abaixo)
        "SELECT setval('pedidos_id_seq', 999, true) WHERE (SELECT last_value FROM pedidos_id_seq) < 1000",
        # 2026-05: flag de submissão automática ao fim da janela de solicitações
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN DEFAULT FALSE",
        # 2026-05: posto/graduação do militar (3º Sgt ... Coronel)
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS posto_graduacao VARCHAR(50)",
        # 2026-05: nome de guerra - exibido no lugar do nome completo nas referências do sistema
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nome_de_guerra VARCHAR(100)",
        # 2026-05: configuração global de data base de entrega (singleton id=1)
        """CREATE TABLE IF NOT EXISTS config_entrega (
            id INTEGER PRIMARY KEY DEFAULT 1,
            data_base DATE NOT NULL DEFAULT '2026-11-18',
            atualizado_em TIMESTAMPTZ DEFAULT NOW(),
            atualizado_por INTEGER REFERENCES usuarios(id)
        )""",
        # Seed da configuração inicial (não sobrescreve se já existir)
        "INSERT INTO config_entrega (id, data_base) VALUES (1, '2026-11-18') ON CONFLICT (id) DO NOTHING",
        # 2026-05: impressão do pedido - quantidade de cópias e tipo de material (nível pedido - legado)
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS impressao_solicitada BOOLEAN DEFAULT FALSE",
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS impressao_quantidade SMALLINT",
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS impressao_tipo_material VARCHAR(20)",
        # 2026-05: impressão per-item - quantidade e material por célula selecionada
        "ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS impressao_quantidade SMALLINT",
        "ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS impressao_tipo_material VARCHAR(20)",
        # 2026-05: finalidade da geoinformação (dropdown) separado da informação complementar (textarea)
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS finalidade_geo VARCHAR(100)",
        # 2026-05: timestamp do último envio de e-mail de ativação (controle de cooldown 30 min)
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activation_email_sent_at TIMESTAMPTZ",
        # 2026-07: Diretoria supervisora do DECEx — roteia pedido ao supervisor da Diretoria
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS diretoria VARCHAR(20)",

        # ── 2026-08: prioridade de encaminhamento sequencial e sem reuso ──────
        # Separa a ordem de trabalho (arrasto) da prioridade definitiva (envio).
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS ordem_fila SMALLINT DEFAULT 0",
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS encaminhado_em TIMESTAMPTZ",
        # Backfill: a leva em que o pedido chegou ao escalão atual. Sem isto os
        # pedidos anteriores à migração ficariam todos empatados na exibição.
        """
        UPDATE pedidos
           SET encaminhado_em = COALESCE(submetido_dsg_em, submetido_gestor_em)
         WHERE encaminhado_em IS NULL
        """,
        # Backfill: a fila do escalão atual começa na ordem que o remetente definiu.
        "UPDATE pedidos SET ordem_fila = prioridade WHERE COALESCE(ordem_fila, 0) = 0",
        # Histórico de prioridades por escalão. A UNIQUE em (escopo, ciclo,
        # prioridade) é o que impede o reuso de um número já encaminhado —
        # garantia de banco, não de aplicação.
        """
        CREATE TABLE IF NOT EXISTS prioridades_encaminhamento (
            id              SERIAL PRIMARY KEY,
            pedido_id       INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
            escopo          VARCHAR(60) NOT NULL,
            escalao         VARCHAR(20) NOT NULL,
            ciclo           INTEGER NOT NULL,
            prioridade      INTEGER NOT NULL,
            definida_por_id INTEGER REFERENCES usuarios(id),
            definida_em     TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_prioridade_escopo_ciclo UNIQUE (escopo, ciclo, prioridade),
            CONSTRAINT uq_prioridade_pedido_escopo UNIQUE (pedido_id, escopo, ciclo)
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_prioridades_pedido ON prioridades_encaminhamento (pedido_id)",
        "CREATE INDEX IF NOT EXISTS ix_prioridades_escopo ON prioridades_encaminhamento (escopo)",
    ]
    for stmt in migrations:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
            logger.debug("Migration OK: %s", stmt[:60])
        except Exception as exc:
            logger.warning("Migration skipped (%s): %s", stmt[:40], exc)

    # ── Migrações de enum - exigem AUTOCOMMIT (fora de bloco de transação) ────
    enum_migrations = [
        "ALTER TYPE tipo_janela_enum ADD VALUE IF NOT EXISTS 'SUPERVISOR'",
        # 2026-05: supervisores regionais por CMilA
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'SUPERVISOR_CMP'",
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'SUPERVISOR_CML'",
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'SUPERVISOR_CMS'",
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'SUPERVISOR_CMO'",
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'SUPERVISOR_CMAO'",
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'SUPERVISOR_CMA'",
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'SUPERVISOR_CMNOR'",  # legado
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'SUPERVISOR_CMNE'",
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'SUPERVISOR_CMSE'",
        # 2026-05: consolidadores por órgão vinculante
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'CONSOLIDADOR_COTER'",
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'CONSOLIDADOR_DSG'",
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'CONSOLIDADOR_DEC'",
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'CONSOLIDADOR_COLOG'",
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'CONSOLIDADOR_DECEX'",
        # 2026-07: supervisores do DECEx por Diretoria/Centro
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'SUPERVISOR_DESMIL'",
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'SUPERVISOR_DETMIL'",
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'SUPERVISOR_DEPA'",
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'SUPERVISOR_DPHCEX'",
        "ALTER TYPE perfil_enum ADD VALUE IF NOT EXISTS 'SUPERVISOR_CCFEX'",
        # 2026-05: tipos de impressão específicos
        "ALTER TYPE tipo_produto_enum ADD VALUE IF NOT EXISTS 'IMPRESSAO_CT'",
        "ALTER TYPE tipo_produto_enum ADD VALUE IF NOT EXISTS 'IMPRESSAO_COI'",
    ]
    async with engine.connect() as conn:
        await conn.execution_options(isolation_level="AUTOCOMMIT")
        for stmt in enum_migrations:
            try:
                await conn.execute(text(stmt))
                logger.debug("Enum migration OK: %s", stmt[:60])
            except Exception as exc:
                logger.warning("Enum migration skipped (%s): %s", stmt[:40], exc)




@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.bdgex_service import preload_caches
    from app.services.auto_submit_service import auto_submit_rascunhos_scheduler

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
    auto_submit_task = asyncio.create_task(auto_submit_rascunhos_scheduler())

    try:
        yield
    finally:
        auto_submit_task.cancel()
        try:
            await auto_submit_task
        except asyncio.CancelledError:
            pass


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
app.include_router(prioridades.router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "version": app.version}
