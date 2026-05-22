"""
Seed script - Roteiro de demonstração ZuluBravo
Executa dentro do container backend: python seed_roteiro.py
"""
import asyncio
from datetime import datetime, date, timezone, timedelta
from bcrypt import hashpw, gensalt

from app.database import AsyncSessionLocal
from sqlalchemy import text

SENHA = "Coter@2024"
SENHA_HASH = hashpw(SENHA.encode(), gensalt()).decode()

async def main():
    async with AsyncSessionLocal() as db:

        # ─────────────────────────────────────────
        # 1. Limpar dados antigos (exceto admin)
        # ─────────────────────────────────────────
        await db.execute(text("DELETE FROM itens_pedido"))
        await db.execute(text("DELETE FROM pedidos"))
        await db.execute(text("DELETE FROM notificacoes"))
        await db.execute(text("DELETE FROM janelas_pedidos"))
        await db.execute(text("DELETE FROM usuarios WHERE id != 1"))
        await db.execute(text("DELETE FROM operacoes"))
        await db.commit()
        print("Dados anteriores removidos.")

        # ─────────────────────────────────────────
        # 2. Criar Operação ZuluBravo
        # ─────────────────────────────────────────
        op = await db.execute(text("""
            INSERT INTO operacoes (nome, om, criado_por)
            VALUES ('ZuluBravo', 'COTER', 1)
            RETURNING id
        """))
        op_id = op.scalar()
        await db.commit()
        print(f"Operação ZuluBravo criada (id={op_id}).")

        # ─────────────────────────────────────────
        # 3. Criar usuários do roteiro
        # (nome, email, om, perfil, demandante, cgeo_id)
        # ─────────────────────────────────────────
        users = [
            ("Ten Gustavo",  "gustavo@eb.mil.br",  "16 GMF",                           "USUARIO_OMDS",      "COTER", None),
            ("Major Couto",  "couto@eb.mil.br",    "Comando de Artilharia do Exército", "GESTOR_BRIGADA",    "COTER", None),
            ("Major Platu",  "platu@eb.mil.br",    "Comando Militar do Planalto",       "GESTOR_CMA",        "COTER", None),
            ("Cap Terone",   "terone@eb.mil.br",   "COTER",                             "GESTOR_DEMANDANTE", "COTER", None),
            ("Cel Lustrosa", "lustrosa@eb.mil.br", "DSG",                               "GESTOR_DSG",        None,    None),
        ]

        user_ids = {}
        for nome, email, om, perfil, demandante, cgeo_id in users:
            dem_clause  = f"'{demandante}'" if demandante else "NULL"
            cgeo_clause = str(cgeo_id)      if cgeo_id   else "NULL"
            r = await db.execute(text(f"""
                INSERT INTO usuarios
                    (nome, email, om, perfil, demandante, cgeo_id, senha_hash,
                     ativo, email_confirmado, tentativas_login)
                VALUES
                    ('{nome}', '{email}', '{om}', '{perfil}',
                     {dem_clause}, {cgeo_clause}, '{SENHA_HASH}', true, true, 0)
                RETURNING id
            """))
            uid = r.scalar()
            user_ids[nome] = uid
            print(f"  Usuário criado: {nome} ({perfil}) id={uid}")

        await db.commit()

        # ─────────────────────────────────────────
        # 4. Janelas de pedidos (abertas para todos)
        # ─────────────────────────────────────────
        inicio = datetime.now(timezone.utc) - timedelta(days=365)
        fim    = datetime.now(timezone.utc) + timedelta(days=365)
        ano    = date.today().year

        janelas = [
            "USUARIO_OMDS",
            "GESTOR_DEMANDANTE",
            "GESTOR_DSG",
            "GESTOR_CGEO",
            "GESTOR_DSG_FINAL",
        ]
        for tipo in janelas:
            await db.execute(text(f"""
                INSERT INTO janelas_pedidos (tipo_janela, data_inicio, data_fim, ano_referencia, criado_por)
                VALUES ('{tipo}', '{inicio.isoformat()}', '{fim.isoformat()}', {ano}, 1)
            """))

        await db.commit()
        print("Janelas criadas para todos os perfis.")

        # ─────────────────────────────────────────
        # 5. Pedido 1 — SUBMETIDO_BRIGADA
        #    Ten Gustavo submeteu; aguarda Major Couto
        # ─────────────────────────────────────────
        data_entrega_1 = (date.today() + timedelta(days=185)).isoformat()
        r = await db.execute(text(f"""
            INSERT INTO pedidos
                (usuario_id, operacao_id, data_entrega, finalidade, demandante,
                 status, prioridade, submetido_gestor_em, criado_em)
            VALUES
                ({user_ids['Ten Gustavo']}, {op_id}, '{data_entrega_1}',
                 'Apoio à Operação ZuluBravo — levantamento de área de manobra',
                 'COTER', 'SUBMETIDO_BRIGADA', 0,
                 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '3 hours')
            RETURNING id
        """))
        p1_id = r.scalar()

        for inom, mi in [("SF-22-X-B-IV", "2965"), ("SF-22-X-B-III", "2964")]:
            await db.execute(text(f"""
                INSERT INTO itens_pedido
                    (pedido_id, tipo_produto, escala, inom, mi,
                     solicitar_mesmo_disponivel, disponivel_bdgex)
                VALUES
                    ({p1_id}, 'CARTA_TOPOGRAFICA', 'E50K', '{inom}', '{mi}', false, false)
            """))

        await db.commit()
        print(f"Pedido #{p1_id} — SUBMETIDO_BRIGADA (Carta Topo 1:50k, Ten Gustavo → Maj Couto).")

        # ─────────────────────────────────────────
        # 6. Pedido 2 — SUBMETIDO_CMA
        #    Major Couto encaminhou; aguarda Major Platu
        # ─────────────────────────────────────────
        data_entrega_2 = (date.today() + timedelta(days=200)).isoformat()
        r = await db.execute(text(f"""
            INSERT INTO pedidos
                (usuario_id, operacao_id, data_entrega, finalidade, demandante,
                 status, prioridade, submetido_gestor_em, criado_em)
            VALUES
                ({user_ids['Ten Gustavo']}, {op_id}, '{data_entrega_2}',
                 'Ortoimagem da zona de operações — Operação ZuluBravo',
                 'COTER', 'SUBMETIDO_CMA', 0,
                 NOW() - INTERVAL '5 hours', NOW() - INTERVAL '6 hours')
            RETURNING id
        """))
        p2_id = r.scalar()

        for inom, mi in [("SF-22-X-A-I", "2961"), ("SF-22-X-A-II", "2962")]:
            await db.execute(text(f"""
                INSERT INTO itens_pedido
                    (pedido_id, tipo_produto, escala, inom, mi,
                     solicitar_mesmo_disponivel, disponivel_bdgex)
                VALUES
                    ({p2_id}, 'ORTOIMAGEM', 'E50K', '{inom}', '{mi}', false, false)
            """))

        await db.commit()
        print(f"Pedido #{p2_id} — SUBMETIDO_CMA (Ortoimagem 1:50k, Maj Couto → Maj Platu).")

        # ─────────────────────────────────────────
        # 7. Pedido 3 — SUBMETIDO_GESTOR
        #    Major Platu encaminhou ao COTER; aguarda Cap Terone
        # ─────────────────────────────────────────
        data_entrega_3 = (date.today() + timedelta(days=125)).isoformat()
        r = await db.execute(text(f"""
            INSERT INTO pedidos
                (usuario_id, operacao_id, data_entrega, finalidade, demandante,
                 status, prioridade, submetido_gestor_em, criado_em)
            VALUES
                ({user_ids['Major Couto']}, {op_id}, '{data_entrega_3}',
                 'MDT da área de emprego da força — Operação ZuluBravo',
                 'COTER', 'SUBMETIDO_GESTOR', 0,
                 NOW() - INTERVAL '20 hours', NOW() - INTERVAL '25 hours')
            RETURNING id
        """))
        p3_id = r.scalar()

        for inom, mi in [("SF-22-X-B-I", "2963")]:
            await db.execute(text(f"""
                INSERT INTO itens_pedido
                    (pedido_id, tipo_produto, escala, inom, mi,
                     solicitar_mesmo_disponivel, disponivel_bdgex)
                VALUES
                    ({p3_id}, 'MDT', 'E50K', '{inom}', '{mi}', false, false)
            """))

        await db.commit()
        print(f"Pedido #{p3_id} — SUBMETIDO_GESTOR (MDT 1:50k, Maj Platu → Cap Terone).")

        # ─────────────────────────────────────────
        # 8. Pedido 4 — SUBMETIDO_DSG
        #    Cap Terone compilou; aguarda Cel Lustrosa
        # ─────────────────────────────────────────
        data_entrega_4 = (date.today() + timedelta(days=150)).isoformat()
        r = await db.execute(text(f"""
            INSERT INTO pedidos
                (usuario_id, operacao_id, data_entrega, finalidade, demandante,
                 status, prioridade, submetido_gestor_em, gestor_demandante_id,
                 submetido_dsg_em, criado_em)
            VALUES
                ({user_ids['Major Platu']}, {op_id}, '{data_entrega_4}',
                 'Carta Ortoimagem para reconhecimento — Operação ZuluBravo',
                 'COTER', 'SUBMETIDO_DSG', 0,
                 NOW() - INTERVAL '36 hours',
                 {user_ids['Cap Terone']},
                 NOW() - INTERVAL '24 hours',
                 NOW() - INTERVAL '40 hours')
            RETURNING id
        """))
        p4_id = r.scalar()

        await db.execute(text(f"""
            INSERT INTO itens_pedido
                (pedido_id, tipo_produto, escala, inom, mi,
                 solicitar_mesmo_disponivel, disponivel_bdgex)
            VALUES
                ({p4_id}, 'CARTA_ORTOIMAGEM', 'E50K', 'SF-22-X-B-II', '2966', false, false)
        """))

        await db.commit()
        print(f"Pedido #{p4_id} — SUBMETIDO_DSG (Carta Ortoimagem 1:50k, Cap Terone → Cel Lustrosa).")

        # ─────────────────────────────────────────
        # 9. Pedido 5 — APROVADO (histórico)
        # ─────────────────────────────────────────
        data_entrega_5 = (date.today() + timedelta(days=90)).isoformat()
        r = await db.execute(text(f"""
            INSERT INTO pedidos
                (usuario_id, operacao_id, data_entrega, finalidade, demandante,
                 status, prioridade, submetido_gestor_em, gestor_demandante_id,
                 submetido_dsg_em, gestor_dsg_id, cgeo_id, aprovado_em, criado_em)
            VALUES
                ({user_ids['Ten Gustavo']}, {op_id}, '{data_entrega_5}',
                 'Levantamento topográfico complementar — Operação ZuluBravo',
                 'COTER', 'APROVADO', 0,
                 NOW() - INTERVAL '72 hours',
                 {user_ids['Cap Terone']},
                 NOW() - INTERVAL '60 hours',
                 {user_ids['Cel Lustrosa']},
                 1,
                 NOW() - INTERVAL '48 hours',
                 NOW() - INTERVAL '75 hours')
            RETURNING id
        """))
        p5_id = r.scalar()

        await db.execute(text(f"""
            INSERT INTO itens_pedido
                (pedido_id, tipo_produto, escala, inom, mi,
                 solicitar_mesmo_disponivel, disponivel_bdgex)
            VALUES
                ({p5_id}, 'CARTA_TOPOGRAFICA', 'E50K', 'SF-22-X-C-I', '2967', false, true)
        """))

        await db.commit()
        print(f"Pedido #{p5_id} — APROVADO (histórico, Carta Topo 1:50k).")

        # ─────────────────────────────────────────
        # Resumo
        # ─────────────────────────────────────────
        print("\n" + "="*60)
        print("ROTEIRO ZuluBravo — SEED CONCLUÍDO")
        print("="*60)
        print(f"  Operação : ZuluBravo (id={op_id})")
        print(f"  Senha    : {SENHA} (todos os usuários)")
        print()
        print("  USUÁRIO            EMAIL                  PERFIL")
        print("  Ten Gustavo        gustavo@eb.mil.br      USUARIO_OMDS")
        print("  Major Couto        couto@eb.mil.br        GESTOR_BRIGADA")
        print("  Major Platu        platu@eb.mil.br        GESTOR_CMA")
        print("  Cap Terone         terone@eb.mil.br       GESTOR_DEMANDANTE (COTER)")
        print("  Cel Lustrosa       lustrosa@eb.mil.br     GESTOR_DSG")
        print()
        print("  PEDIDO  STATUS              PRODUTO             AGUARDANDO")
        print(f"  #{p1_id}      SUBMETIDO_BRIGADA   Carta Topo 1:50k    Major Couto (Brigada)")
        print(f"  #{p2_id}      SUBMETIDO_CMA       Ortoimagem 1:50k    Major Platu (CMA)")
        print(f"  #{p3_id}      SUBMETIDO_GESTOR    MDT 1:50k           Cap Terone (COTER)")
        print(f"  #{p4_id}      SUBMETIDO_DSG       Carta Ortoimagem    Cel Lustrosa (DSG)")
        print(f"  #{p5_id}      APROVADO            Carta Topo 1:50k    Concluído")
        print("="*60)

asyncio.run(main())
