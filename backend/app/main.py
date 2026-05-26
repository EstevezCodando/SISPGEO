# SisPGeo — Sistema de Pedidos de Geoinformação
# © 2026 Estevez Alvarez <alvarez.jean@eb.mil.br>  ·  Software Engineer
# Regras de negócio: Raphael Perrut <perrut.raphael@eb.mil.br>  ·  Cartographic Engineer

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

    Migrações DDL de enum (ALTER TYPE ADD VALUE) são executadas em modo AUTOCOMMIT
    separado, pois o PostgreSQL não permite esse comando dentro de blocos de
    transação que já contêm outros statements.
    """
    # ── Migrações transacionais — cada uma em transação própria ────────────────
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
        # 2026-05: regiao_militar em pedidos — roteamento para supervisor intermediário (C. Mil. A)
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS regiao_militar VARCHAR(20)",
        # backfill: preenche regiao_militar a partir do usuario que criou o pedido
        "UPDATE pedidos p SET regiao_militar = u.regiao_militar FROM usuarios u WHERE u.id = p.criador_id AND p.regiao_militar IS NULL",
        # 2026-05: prioridade de item dentro do pedido
        "ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS prioridade SMALLINT DEFAULT 0",
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
        # 2026-05: posto/graduação do militar (Civil, Sd EV, Cb, Cap, TC, Cel...)
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS posto_graduacao VARCHAR(50)",
        # 2026-05: nome de guerra — exibido no lugar do nome completo nas referências do sistema
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
        # 2026-05: impressão física do pedido — quantidade de cópias e tipo de material (nível pedido — legado)
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS impressao_solicitada BOOLEAN DEFAULT FALSE",
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS impressao_quantidade SMALLINT",
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS impressao_tipo_material VARCHAR(20)",
        # 2026-05: impressão per-item — quantidade e material por célula selecionada
        "ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS impressao_quantidade SMALLINT",
        "ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS impressao_tipo_material VARCHAR(20)",
        # 2026-05: finalidade da geoinformação (dropdown) separado da informação complementar (textarea)
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS finalidade_geo VARCHAR(100)",
        # 2026-05: timestamp do último envio de e-mail de ativação (controle de cooldown 30 min)
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activation_email_sent_at TIMESTAMPTZ",
    ]
    for stmt in migrations:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
            logger.debug("Migration OK: %s", stmt[:60])
        except Exception as exc:
            logger.warning("Migration skipped (%s): %s", stmt[:40], exc)

    # ── Migrações de enum — exigem AUTOCOMMIT (fora de bloco de transação) ────
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


async def _create_test_users():
    """Cria usuários de teste fixos quando BDGEX_MOCK=true (ambiente de CI/dev).

    Os usuários são criados já ativos e com e-mail confirmado para que os
    testes de integração possam fazer login sem depender do fluxo de e-mail.

    Usuários criados:
        - gustavo@eb.mil.br      / Gustavo@1234      — SOLICITANTE, OM=22º B I (CMP)
        - joao@eb.mil.br         / Joao@1234         — SOLICITANTE, OM=22º B I (CMP, herdeiro)
        - supervisor.cmilA@eb.mil.br / Supervisor@1234 — SUPERVISOR, OM=CMDO C M P
        - consolidador.coter@eb.mil.br / Consolidador@1234 — CONSOLIDADOR, OM=COTER
        - analista.cgeo@eb.mil.br / AnalistaCGEO@1234 — ANALISTA_CGEO, OM=DSG
    """
    # Dupla guarda: BDGEX_MOCK E não-produção — nunca criar usuários de teste em prod
    if not settings.BDGEX_MOCK or settings.ENV == "production":
        return

    from app.models.user import Usuario
    from app.models.enums import PerfilEnum, OrgaoVinculanteEnum, PostoGraduacaoEnum
    from app.utils.security import get_password_hash

    test_users = [
        # Solicitante OMDS — 22º B I (CMP - Comando Militar do Planalto)
        dict(
            nome="Gustavo Silva",
            nome_de_guerra="Silva",
            email="gustavo@eb.mil.br",
            telefone="(61) 99900-0001",
            secao_om="S3",
            om="22º B I",
            regiao_militar="CMP",
            orgao_vinculante=OrgaoVinculanteEnum.COTER,
            perfil=PerfilEnum.SOLICITANTE,
            posto_graduacao=PostoGraduacaoEnum.SEGUNDO_SGT,
            senha_hash=get_password_hash("Gustavo@1234"),
        ),
        # Solicitante auxiliar (mesmo batalhão)
        dict(
            nome="João Ferreira",
            nome_de_guerra="Ferreira",
            email="joao@eb.mil.br",
            telefone="(61) 99900-0002",
            secao_om="S3",
            om="22º B I",
            regiao_militar="CMP",
            orgao_vinculante=OrgaoVinculanteEnum.COTER,
            perfil=PerfilEnum.SOLICITANTE,
            posto_graduacao=PostoGraduacaoEnum.CABO,
            senha_hash=get_password_hash("Joao@1234"),
        ),
        # Supervisor do C. Mil. A Planalto
        dict(
            nome="Paulo Supervisor",
            nome_de_guerra="Paulo",
            email="supervisor.cmilA@eb.mil.br",
            telefone="(61) 99900-0010",
            secao_om="Seção de Geoinformação",
            om="CMDO C M P",
            regiao_militar="CMP",
            orgao_vinculante=OrgaoVinculanteEnum.COTER,
            perfil=PerfilEnum.SUPERVISOR,
            posto_graduacao=PostoGraduacaoEnum.MAJOR,
            senha_hash=get_password_hash("Supervisor@1234"),
        ),
        # Consolidador COTER
        dict(
            nome="Carlos Consolidador",
            nome_de_guerra="Carlos",
            email="consolidador.coter@eb.mil.br",
            telefone="(61) 99900-0020",
            secao_om="Seção de Geoinformação e Cartografia",
            om="COTER",
            regiao_militar="CMP",
            orgao_vinculante=OrgaoVinculanteEnum.COTER,
            perfil=PerfilEnum.CONSOLIDADOR,
            posto_graduacao=PostoGraduacaoEnum.TENENTE_CEL,
            senha_hash=get_password_hash("Consolidador@1234"),
        ),
        # Analista CGEO
        dict(
            nome="Ricardo CGEO",
            nome_de_guerra="Ricardo",
            email="analista.cgeo@eb.mil.br",
            telefone="(61) 99900-0030",
            secao_om="Seção de Análise",
            om="DSG",
            regiao_militar="CMP",
            orgao_vinculante=None,
            perfil=PerfilEnum.ANALISTA_CGEO,
            posto_graduacao=PostoGraduacaoEnum.CAPITAO,
            senha_hash=get_password_hash("AnalistaCGEO@1234"),
        ),
    ]

    async with AsyncSessionLocal() as db:
        for data in test_users:
            existing = await db.scalar(
                select(Usuario).where(Usuario.email == data["email"])
            )
            if existing:
                # Garante que usuários de teste pré-existentes estejam ativos
                # e com senha/OM corretos (idempotente).
                existing.ativo = True
                existing.email_confirmado = True
                existing.senha_hash = data["senha_hash"]
                existing.om = data["om"]
                existing.regiao_militar = data["regiao_militar"]
                existing.perfil = data["perfil"]
                existing.orgao_vinculante = data["orgao_vinculante"]
                existing.posto_graduacao = data["posto_graduacao"]
                existing.pedidos_transferidos_em = None  # reset para testes de herança
            else:
                user = Usuario(
                    **data,
                    ativo=True,
                    email_confirmado=True,
                    ultima_senha_alterada=datetime.now(timezone.utc),
                )
                db.add(user)
        await db.commit()
    logger.info("✓ Usuários de teste sincronizados (gustavo / joao / supervisor / consolidador / analista_cgeo) — BDGEX_MOCK=true")


async def _create_test_janelas():
    """Cria as janelas do ciclo 2026 quando BDGEX_MOCK=true (ambiente de CI/dev).

    Janelas criadas (idempotente — não recria se já existirem):
        SOLICITANTE  : 20/05/2026 – 30/06/2026
        SUPERVISOR   : 02/07/2026 – 31/07/2026
        CONSOLIDADOR : 02/08/2026 – 31/08/2026
        GESTOR_CARTOGRAFICO (DSG): 01/09/2026 – 30/09/2026
    """
    if not settings.BDGEX_MOCK or settings.ENV == "production":
        return

    from app.models.janela import JanelaPedidos
    from app.models.enums import TipoJanelaEnum
    from sqlalchemy import select

    ANO = 2026

    janelas_config = [
        dict(
            tipo_janela=TipoJanelaEnum.SOLICITANTE,
            data_inicio=datetime(2026, 5, 20, 0, 0, tzinfo=timezone.utc),
            data_fim=datetime(2026, 6, 30, 23, 59, tzinfo=timezone.utc),
            ano_referencia=ANO,
        ),
        dict(
            tipo_janela=TipoJanelaEnum.SUPERVISOR,
            data_inicio=datetime(2026, 7, 2, 0, 0, tzinfo=timezone.utc),
            data_fim=datetime(2026, 7, 31, 23, 59, tzinfo=timezone.utc),
            ano_referencia=ANO,
        ),
        dict(
            tipo_janela=TipoJanelaEnum.CONSOLIDADOR,
            data_inicio=datetime(2026, 8, 2, 0, 0, tzinfo=timezone.utc),
            data_fim=datetime(2026, 8, 31, 23, 59, tzinfo=timezone.utc),
            ano_referencia=ANO,
        ),
        dict(
            tipo_janela=TipoJanelaEnum.GESTOR_CARTOGRAFICO,
            data_inicio=datetime(2026, 9, 1, 0, 0, tzinfo=timezone.utc),
            data_fim=datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc),
            ano_referencia=ANO,
        ),
    ]

    async with AsyncSessionLocal() as db:
        # Busca o admin para usar como criador
        from app.models.user import Usuario
        admin = await db.scalar(select(Usuario).where(Usuario.email == "admin@eb.mil.br"))
        if not admin:
            logger.warning("Admin não encontrado — janelas de teste não criadas")
            return

        for cfg in janelas_config:
            existing = await db.scalar(
                select(JanelaPedidos).where(
                    JanelaPedidos.tipo_janela == cfg["tipo_janela"],
                    JanelaPedidos.ano_referencia == ANO,
                )
            )
            if existing:
                continue  # já existe, não recria

            janela = JanelaPedidos(
                **cfg,
                criado_por=admin.id,
            )
            db.add(janela)

        await db.commit()

    logger.info(
        "✓ Janelas de teste 2026 sincronizadas (SOLICITANTE 20/05–30/06 | SUPERVISOR 02/07–31/07 | "
        "CONSOLIDADOR 02/08–31/08 | GESTOR_CARTOGRAFICO 01/09–30/09)"
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.bdgex_service import preload_caches

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _run_migrations()
    # asyncpg cacheia tipos enum na conexão — descartar o pool força reconexão
    # com o cache atualizado após qualquer ALTER TYPE executado acima.
    await engine.dispose()
    await _create_admin()
    await _create_test_users()
    await _create_test_janelas()

    # Pré-aquece caches de grade em background — servidor sobe imediatamente.
    # Na 1ª execução: constrói os .gz a partir dos GeoJSONs e salva em disco.
    # Reinicializações: lê os .gz do disco em < 1 s por arquivo.
    asyncio.create_task(preload_caches())

    yield


app = FastAPI(
    title="SisPGeo — Sistema de Pedidos de Geoinformação",
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
