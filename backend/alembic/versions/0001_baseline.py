"""baseline — schema historico migrado de _run_migrations

Revision ID: 0001
Revises:
Create Date: 2026-06-20

ATENÇÃO — leia antes de aplicar manualmente:

Em bancos JÁ EXISTENTES (produção), o lifespan do app stampa esta revisão
automaticamente na primeira subida com Alembic, sem re-executar o upgrade().
O upgrade() só roda em bancos onde o schema foi criado antes desta migração
e Alembic ainda não foi inicializado — nesse caso, todas as operações são
idempotentes e seguras para re-execução.

Em bancos NOVOS (create_all já criou o schema atual), o lifespan também
stampa 0001 automaticamente — o upgrade() não é invocado.
"""
from alembic import op


revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Cada bloco DO $$ ... END $$ é independente da transação externa do Alembic.
    # EXCEPTION WHEN OTHERS THEN NULL → absorve falhas de operações já aplicadas.
    # IF EXISTS / IF NOT EXISTS → garante idempotência nas demais.

    # Ampliar tipo de geometria de POLYGON → GEOMETRY (suporta MultiPolygon)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE bdgex_cache
                ALTER COLUMN geom TYPE geometry(GEOMETRY,4326)
                USING geom::geometry(GEOMETRY,4326);
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$;
    """)

    op.execute("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS link_bdgex TEXT")
    op.execute(
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS"
        " criador_id INTEGER REFERENCES usuarios(id)"
    )
    op.execute(
        "UPDATE pedidos SET criador_id = usuario_id WHERE criador_id IS NULL"
    )
    op.execute(
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS"
        " pedidos_transferidos_em TIMESTAMPTZ"
    )

    # Ampliar regiao_militar para acomodar "12ª RM" (6 chars UTF-8)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE usuarios ALTER COLUMN regiao_militar TYPE VARCHAR(20);
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$;
    """)

    op.execute(
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS regiao_militar VARCHAR(20)"
    )
    op.execute("""
        UPDATE pedidos p
        SET regiao_militar = u.regiao_militar
        FROM usuarios u
        WHERE u.id = p.criador_id
          AND p.regiao_militar IS NULL
    """)
    op.execute(
        "ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS"
        " prioridade SMALLINT DEFAULT 0"
    )

    # Renomear demandante → orgao_vinculante (idempotente via verificação de existência)
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'usuarios' AND column_name = 'demandante'
            ) THEN
                ALTER TABLE usuarios RENAME COLUMN demandante TO orgao_vinculante;
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'pedidos' AND column_name = 'demandante'
            ) THEN
                ALTER TABLE pedidos RENAME COLUMN demandante TO orgao_vinculante;
            END IF;
        END $$;
    """)

    op.execute(
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone_ritex VARCHAR(10)"
    )

    # Garante que IDs de pedidos iniciam em 1000
    op.execute("""
        SELECT setval('pedidos_id_seq', 999, true)
        WHERE (SELECT last_value FROM pedidos_id_seq) < 1000
    """)

    op.execute(
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS"
        " auto_submitted BOOLEAN DEFAULT FALSE"
    )
    op.execute(
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS posto_graduacao VARCHAR(50)"
    )
    op.execute(
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nome_de_guerra VARCHAR(100)"
    )

    op.execute("""
        CREATE TABLE IF NOT EXISTS config_entrega (
            id               INTEGER PRIMARY KEY DEFAULT 1,
            data_base        DATE NOT NULL DEFAULT '2026-11-18',
            atualizado_em    TIMESTAMPTZ DEFAULT NOW(),
            atualizado_por   INTEGER REFERENCES usuarios(id)
        )
    """)
    op.execute("""
        INSERT INTO config_entrega (id, data_base)
        VALUES (1, '2026-11-18')
        ON CONFLICT (id) DO NOTHING
    """)

    # Impressão em nível de pedido (legado — colunas mantidas para compatibilidade)
    op.execute(
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS"
        " impressao_solicitada BOOLEAN DEFAULT FALSE"
    )
    op.execute(
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS impressao_quantidade SMALLINT"
    )
    op.execute(
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS"
        " impressao_tipo_material VARCHAR(20)"
    )

    # Impressão por item (quantidade e material por célula)
    op.execute(
        "ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS"
        " impressao_quantidade SMALLINT"
    )
    op.execute(
        "ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS"
        " impressao_tipo_material VARCHAR(20)"
    )

    op.execute(
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS finalidade_geo VARCHAR(100)"
    )
    op.execute(
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS"
        " activation_email_sent_at TIMESTAMPTZ"
    )


def downgrade() -> None:
    # Baseline histórico — rollback não implementado intencionalmente.
    # Reverter estas alterações exigiria dropar colunas com dados de produção.
    pass
