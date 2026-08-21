"""
Testes das prioridades atribuídas por Supervisor e Consolidador.

Cobrem os endpoints ``PUT /pedidos/reorder`` e ``PUT /pedidos/{id}/items/reorder``
e as regras de escopo que impedem um escalão de reordenar pedidos de outro.

As funções de rota são chamadas diretamente com uma AsyncSession mockada; as
cláusulas SQLAlchemy geradas são compiladas para texto e inspecionadas.
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.models.enums import OrgaoVinculanteEnum, PerfilEnum, StatusPedidoEnum
from app.routers import pedidos as pedidos_router
from app.schemas.pedido import ReorderRequest

from .conftest import _make_pedido, _make_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

AGORA = datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc)


def _sql(clause) -> str:
    """Compila uma cláusula/statement SQLAlchemy com os literais embutidos."""
    return str(clause.compile(compile_kwargs={"literal_binds": True}))


def _db_capturando_updates(rowcount: int = 1):
    """AsyncSession mockada que registra cada statement passado a ``execute``."""
    db = AsyncMock()
    db.add = MagicMock()          # síncrono no SQLAlchemy
    db.commit = AsyncMock()
    db.scalars = AsyncMock(return_value=MagicMock(
        __iter__=MagicMock(return_value=iter([]))
    ))
    executados: list = []

    async def _execute(stmt, *args, **kwargs):
        executados.append(stmt)
        res = MagicMock()
        res.rowcount = rowcount
        return res

    db.execute = AsyncMock(side_effect=_execute)
    db.executados = executados
    return db


def _supervisor(perfil=PerfilEnum.SUPERVISOR_CMP):
    return _make_user(
        user_id=2, email="sup@eb.mil.br", perfil=perfil,
        orgao_vinculante=OrgaoVinculanteEnum.COTER,
    )


def _consolidador(perfil=PerfilEnum.CONSOLIDADOR_COTER):
    return _make_user(
        user_id=3, email="cons@eb.mil.br", perfil=perfil,
        orgao_vinculante=OrgaoVinculanteEnum.COTER,
    )


# ---------------------------------------------------------------------------
# Autorização do reorder
# ---------------------------------------------------------------------------

class TestReorderAutorizacao:
    async def test_supervisor_pode_reordenar(self):
        db = _db_capturando_updates()
        r = await pedidos_router.reorder_pedidos(
            ReorderRequest(ordered_ids=[7, 8, 9]), db=db, current_user=_supervisor(),
        )
        assert r["reordenados"] == 3

    async def test_consolidador_pode_reordenar(self):
        db = _db_capturando_updates()
        r = await pedidos_router.reorder_pedidos(
            ReorderRequest(ordered_ids=[7, 8]), db=db, current_user=_consolidador(),
        )
        assert r["reordenados"] == 2

    async def test_solicitante_pode_reordenar(self):
        db = _db_capturando_updates()
        r = await pedidos_router.reorder_pedidos(
            ReorderRequest(ordered_ids=[1]), db=db,
            current_user=_make_user(perfil=PerfilEnum.SOLICITANTE),
        )
        assert r["reordenados"] == 1

    @pytest.mark.parametrize("perfil", [
        PerfilEnum.GESTOR_CARTOGRAFICO,
        PerfilEnum.ANALISTA_CGEO,
    ])
    async def test_perfis_nao_autorizados_recebem_403(self, perfil):
        db = _db_capturando_updates()
        with pytest.raises(HTTPException) as exc:
            await pedidos_router.reorder_pedidos(
                ReorderRequest(ordered_ids=[1]), db=db,
                current_user=_make_user(perfil=perfil),
            )
        assert exc.value.status_code == 403
        assert db.execute.await_count == 0

    @pytest.mark.parametrize("perfil", [
        PerfilEnum.SUPERVISOR_CML, PerfilEnum.SUPERVISOR_CMS,
        PerfilEnum.SUPERVISOR_DESMIL, PerfilEnum.CONSOLIDADOR_DEC,
        PerfilEnum.CONSOLIDADOR_DECEX, PerfilEnum.SUPERVISOR,
        PerfilEnum.CONSOLIDADOR,
    ])
    async def test_todos_supervisores_e_consolidadores_autorizados(self, perfil):
        db = _db_capturando_updates()
        r = await pedidos_router.reorder_pedidos(
            ReorderRequest(ordered_ids=[1, 2]), db=db,
            current_user=_make_user(
                perfil=perfil, orgao_vinculante=OrgaoVinculanteEnum.COTER,
                regiao_militar="CMP",
            ),
        )
        assert r["reordenados"] == 2


# ---------------------------------------------------------------------------
# Ranks gravados
# ---------------------------------------------------------------------------

class TestReorderRanks:
    async def test_ranks_sao_sequenciais_a_partir_de_1(self):
        db = _db_capturando_updates()
        await pedidos_router.reorder_pedidos(
            ReorderRequest(ordered_ids=[30, 10, 20]), db=db, current_user=_supervisor(),
        )
        sqls = [_sql(s) for s in db.executados]
        assert len(sqls) == 3
        # O arrasto grava ordem_fila (ordem de trabalho), nunca a prioridade
        # definitiva — esta é carimbada no envio.
        assert "ordem_fila=1" in sqls[0].replace(" ", "") and "id = 30" in sqls[0]
        assert "ordem_fila=2" in sqls[1].replace(" ", "") and "id = 10" in sqls[1]
        assert "ordem_fila=3" in sqls[2].replace(" ", "") and "id = 20" in sqls[2]
        assert not any("prioridade" in q for q in sqls)

    async def test_commit_e_executado(self):
        db = _db_capturando_updates()
        await pedidos_router.reorder_pedidos(
            ReorderRequest(ordered_ids=[1, 2]), db=db, current_user=_consolidador(),
        )
        db.commit.assert_awaited_once()

    async def test_pedido_fora_de_escopo_nao_e_contado(self):
        """UPDATE com scope clause não casa → rowcount 0 → não entra na contagem."""
        db = _db_capturando_updates(rowcount=0)
        r = await pedidos_router.reorder_pedidos(
            ReorderRequest(ordered_ids=[999]), db=db, current_user=_supervisor(),
        )
        assert r["reordenados"] == 0


# ---------------------------------------------------------------------------
# Escopo aplicado ao UPDATE
# ---------------------------------------------------------------------------

class TestReorderEscopo:
    async def test_supervisor_regional_restringe_por_orgao_e_rm(self):
        db = _db_capturando_updates()
        await pedidos_router.reorder_pedidos(
            ReorderRequest(ordered_ids=[1]), db=db,
            current_user=_supervisor(PerfilEnum.SUPERVISOR_CMS),
        )
        sql = _sql(db.executados[0])
        assert "orgao_vinculante = 'COTER'" in sql
        assert "regiao_militar = 'CMS'" in sql

    async def test_supervisor_decex_restringe_por_diretoria(self):
        db = _db_capturando_updates()
        await pedidos_router.reorder_pedidos(
            ReorderRequest(ordered_ids=[1]), db=db,
            current_user=_make_user(
                perfil=PerfilEnum.SUPERVISOR_DESMIL,
                orgao_vinculante=OrgaoVinculanteEnum.DECEx,
            ),
        )
        sql = _sql(db.executados[0])
        assert "orgao_vinculante = 'DECEx'" in sql
        assert "diretoria = 'DESMIL'" in sql

    async def test_consolidador_restringe_por_orgao_vinculante(self):
        db = _db_capturando_updates()
        await pedidos_router.reorder_pedidos(
            ReorderRequest(ordered_ids=[1]), db=db,
            current_user=_consolidador(PerfilEnum.CONSOLIDADOR_DEC),
        )
        sql = _sql(db.executados[0])
        assert "orgao_vinculante = 'DEC'" in sql
        # Consolidador não é restrito por Região Militar — ele vê o órgão inteiro.
        assert "regiao_militar" not in sql

    async def test_consolidador_dec_nao_alcanca_pedidos_decex(self):
        """Regressão: DEC e DECEx são órgãos distintos, não pode haver casamento parcial."""
        db = _db_capturando_updates()
        await pedidos_router.reorder_pedidos(
            ReorderRequest(ordered_ids=[1]), db=db,
            current_user=_consolidador(PerfilEnum.CONSOLIDADOR_DEC),
        )
        sql = _sql(db.executados[0])
        assert "orgao_vinculante = 'DEC'" in sql
        assert "'DECEx'" not in sql

    async def test_solicitante_restringe_aos_proprios_pedidos(self):
        db = _db_capturando_updates()
        await pedidos_router.reorder_pedidos(
            ReorderRequest(ordered_ids=[1]), db=db,
            current_user=_make_user(user_id=42, perfil=PerfilEnum.SOLICITANTE),
        )
        sql = _sql(db.executados[0])
        assert "usuario_id = 42" in sql
        assert "criador_id = 42" in sql


# ---------------------------------------------------------------------------
# Escopo em Python (_pedido_in_user_scope) — coerência com o SQL
# ---------------------------------------------------------------------------

class TestEscopoPython:
    def test_supervisor_cmp_possui_pedido_da_propria_rm(self):
        p = _make_pedido(orgao_vinculante=OrgaoVinculanteEnum.COTER)
        p.regiao_militar = "CMP"
        assert pedidos_router._pedido_in_user_scope(_supervisor(), p) is True

    def test_supervisor_cmp_nao_possui_pedido_de_outra_rm(self):
        p = _make_pedido(orgao_vinculante=OrgaoVinculanteEnum.COTER)
        p.regiao_militar = "CML"
        assert pedidos_router._pedido_in_user_scope(_supervisor(), p) is False

    def test_consolidador_coter_nao_possui_pedido_dec(self):
        p = _make_pedido(orgao_vinculante=OrgaoVinculanteEnum.DEC)
        assert pedidos_router._pedido_in_user_scope(_consolidador(), p) is False

    def test_consolidador_dec_nao_possui_pedido_decex(self):
        p = _make_pedido(orgao_vinculante=OrgaoVinculanteEnum.DECEx)
        user = _consolidador(PerfilEnum.CONSOLIDADOR_DEC)
        assert pedidos_router._pedido_in_user_scope(user, p) is False


# ---------------------------------------------------------------------------
# Reorder de itens dentro do pedido
# ---------------------------------------------------------------------------

class TestReorderItens:
    async def test_supervisor_reordena_itens_do_proprio_escopo(self):
        db = _db_capturando_updates()
        p = _make_pedido(orgao_vinculante=OrgaoVinculanteEnum.COTER)
        p.regiao_militar = "CMP"
        db.get = AsyncMock(return_value=p)

        r = await pedidos_router.reorder_items(
            p.id, ReorderRequest(ordered_ids=[5, 6]), db=db, current_user=_supervisor(),
        )
        assert r["reordenados"] == 2
        sqls = [_sql(s) for s in db.executados]
        assert "prioridade=1" in sqls[0].replace(" ", "")
        assert "prioridade=2" in sqls[1].replace(" ", "")

    async def test_supervisor_nao_reordena_itens_de_outra_rm(self):
        db = _db_capturando_updates()
        p = _make_pedido(orgao_vinculante=OrgaoVinculanteEnum.COTER)
        p.regiao_militar = "CML"
        db.get = AsyncMock(return_value=p)

        with pytest.raises(HTTPException) as exc:
            await pedidos_router.reorder_items(
                p.id, ReorderRequest(ordered_ids=[5]), db=db, current_user=_supervisor(),
            )
        assert exc.value.status_code == 403

    async def test_pedido_inexistente_retorna_404(self):
        db = _db_capturando_updates()
        db.get = AsyncMock(return_value=None)
        with pytest.raises(HTTPException) as exc:
            await pedidos_router.reorder_items(
                123, ReorderRequest(ordered_ids=[1]), db=db, current_user=_supervisor(),
            )
        assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# Persistência: a prioridade sobrevive ao encaminhamento entre escalões?
# ---------------------------------------------------------------------------

class TestPrioridadeNoFluxo:
    async def test_consolidate_carimba_prioridade_definitiva(self):
        """Ao encaminhar, o pedido recebe a prioridade definitiva do remetente,
        continuando a sequência daquele escalão."""
        from unittest.mock import patch
        from app.services import pedido_service

        p = _make_pedido(status=StatusPedidoEnum.AGUARDANDO_SUPERVISOR)
        p.regiao_militar = "CMP"
        p.prioridade = 3

        db = AsyncMock()
        db.add = MagicMock()          # síncrono no SQLAlchemy
        db.commit = AsyncMock()
        db.get = AsyncMock(return_value=p)
        db.scalar = AsyncMock(return_value=None)
        db.scalars = AsyncMock(return_value=MagicMock(
            __iter__=MagicMock(return_value=iter([]))
        ))

        with patch("app.services.pedido_service.NotificationService") as svc_cls:
            svc_cls.return_value = AsyncMock()
            r = await pedido_service.consolidate_pedidos(db, [p.id], _supervisor())

        assert r["submetidos"] == 1
        assert p.status == StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR
        # Sequência vazia neste escalão → primeira prioridade emitida é 1.
        assert p.prioridade == 1
        # A fila do escalão seguinte começa na ordem que este remetente definiu.
        assert p.ordem_fila == 1
        assert p.encaminhado_em is not None


# ---------------------------------------------------------------------------
# Ordenação: prioridade 0 significa "não priorizado", não "primeiro lugar"
# ---------------------------------------------------------------------------

class TestOrdenacaoNaoPriorizados:
    """Pedidos/itens nunca arrastados ficam com ``prioridade = 0`` (default da
    coluna). Numa ordenação ASC ingênua, esse 0 fica **à frente** do pedido que
    o supervisor marcou explicitamente como nº 1 — invertendo a decisão do
    escalão nos relatórios e exportações."""

    def test_pedidos_nao_priorizados_vao_para_o_fim(self):
        novo = _make_pedido(pedido_id=99)
        novo.prioridade = 0            # nunca reordenado
        primeiro = _make_pedido(pedido_id=1)
        primeiro.prioridade = 1        # arrastado para o topo pelo supervisor
        segundo = _make_pedido(pedido_id=2)
        segundo.prioridade = 2

        ordenados = sorted(
            [novo, segundo, primeiro], key=pedidos_router.chave_prioridade,
        )
        assert [p.id for p in ordenados] == [1, 2, 99]

    def test_itens_nao_priorizados_vao_para_o_fim(self):
        def _item(item_id, prio):
            it = MagicMock()
            it.id = item_id
            it.prioridade = prio
            return it

        ordenados = sorted(
            [_item(9, 0), _item(2, 2), _item(1, 1)],
            key=pedidos_router.chave_prioridade,
        )
        assert [i.id for i in ordenados] == [1, 2, 9]

    def test_todos_sem_prioridade_mantem_ordem_estavel(self):
        a, b, c = (_make_pedido(pedido_id=i) for i in (5, 6, 7))
        for p in (a, b, c):
            p.prioridade = 0
        ordenados = sorted([a, b, c], key=pedidos_router.chave_prioridade)
        assert [p.id for p in ordenados] == [5, 6, 7]

    def test_order_by_sql_posterga_prioridade_zero(self):
        """A cláusula SQL usada nos relatórios precisa do mesmo critério."""
        from sqlalchemy import select
        from app.models.pedido import Pedido

        stmt = select(Pedido.id).order_by(*pedidos_router.ordem_prioridade())
        sql = _sql(stmt)
        assert "ORDER BY" in sql
        # A prioridade 0 precisa ser desempatada por um CASE antes do ASC cru.
        assert "CASE" in sql.upper()
        assert sql.upper().index("CASE") < sql.upper().index("PRIORIDADE ASC")


# ---------------------------------------------------------------------------
# Sequência de prioridades: contínua, sem reuso
# ---------------------------------------------------------------------------

class TestSequenciaPrioridade:
    """Reproduz o cenário que quebrou em produção.

    O consolidador enviou 4 levas — [1031,1041,1034], [1006], [1023],
    [1020,1032,1019] — e esperava as prioridades 1..8. O arrasto gravava
    ``1..N`` sobre a fila pendente; como cada leva enviada saía da fila, a
    seguinte reaproveitava números: 1006 e 1020 ficaram ambos com 8, e
    1023 e 1032 ambos com 9.
    """

    @staticmethod
    def _db_com_sequencia(inicial: int = 0):
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.scalar = AsyncMock(return_value=inicial or None)
        return db

    async def test_primeira_leva_comeca_em_1(self):
        from app.services.prioridade_service import carimbar_encaminhamento

        db = self._db_com_sequencia()
        pedidos = [_make_pedido(pedido_id=i) for i in (1031, 1041, 1034)]
        r = await carimbar_encaminhamento(db, pedidos, _consolidador())
        assert r == {1031: 1, 1041: 2, 1034: 3}

    async def test_leva_seguinte_continua_a_sequencia(self):
        """Após 3 prioridades consumidas, o próximo envio começa em 4 — não em 1."""
        from app.services.prioridade_service import carimbar_encaminhamento

        db = self._db_com_sequencia(inicial=3)
        r = await carimbar_encaminhamento(db, [_make_pedido(pedido_id=1006)], _consolidador())
        assert r == {1006: 4}

    async def test_cenario_completo_das_quatro_levas(self):
        """As 4 levas devem produzir exatamente as prioridades 1..8, sem repetir."""
        from app.services.prioridade_service import carimbar_encaminhamento

        levas = [[1031, 1041, 1034], [1006], [1023], [1020, 1032, 1019]]
        consolidador = _consolidador(PerfilEnum.CONSOLIDADOR_DSG)
        emitidas: dict[int, int] = {}
        ultima = 0

        for leva in levas:
            db = self._db_com_sequencia(inicial=ultima)
            r = await carimbar_encaminhamento(
                db, [_make_pedido(pedido_id=i) for i in leva], consolidador,
            )
            emitidas.update(r)
            ultima = max(r.values())

        assert emitidas == {
            1031: 1, 1041: 2, 1034: 3,
            1006: 4,
            1023: 5,
            1020: 6, 1032: 7, 1019: 8,
        }
        # Nenhum número reaproveitado — era exatamente o defeito em produção.
        assert len(set(emitidas.values())) == len(emitidas)
        # E a ordem final é a que o usuário pretendeu.
        assert sorted(emitidas, key=emitidas.get) == [
            1031, 1041, 1034, 1006, 1023, 1020, 1032, 1019,
        ]

    async def test_leva_e_numerada_na_ordem_da_fila(self):
        """Quem está em primeiro na fila recebe a menor prioridade da leva."""
        from app.services.prioridade_service import carimbar_encaminhamento

        db = self._db_com_sequencia()
        p1, p2, p3 = (_make_pedido(pedido_id=i) for i in (77, 88, 99))
        p1.ordem_fila, p2.ordem_fila, p3.ordem_fila = 3, 1, 2
        ordenados = sorted([p1, p2, p3], key=lambda x: x.ordem_fila)
        r = await carimbar_encaminhamento(db, ordenados, _consolidador())
        assert r == {88: 1, 99: 2, 77: 3}

    async def test_escalao_registrado_no_historico(self):
        from app.services.prioridade_service import carimbar_encaminhamento

        db = self._db_com_sequencia()
        await carimbar_encaminhamento(db, [_make_pedido(pedido_id=5)], _supervisor())
        from app.models.prioridade import PrioridadeEncaminhamento
        registro = next(
            c[0][0] for c in db.add.call_args_list
            if isinstance(c[0][0], PrioridadeEncaminhamento)
        )
        assert registro.escalao == "SUPERVISOR"
        assert registro.escopo == "SUPERVISOR_CMP"
        assert registro.prioridade == 1

    async def test_leva_vazia_nao_consome_numero(self):
        from app.services.prioridade_service import carimbar_encaminhamento

        db = self._db_com_sequencia()
        assert await carimbar_encaminhamento(db, [], _consolidador()) == {}
        db.add.assert_not_called()


class TestEscopoSequencia:
    """Cada escalão tem a sua própria sequência — não compartilham numeração."""

    def test_supervisores_de_cmila_distintos_tem_escopos_distintos(self):
        from app.services.prioridade_service import escopo_de

        assert escopo_de(_supervisor(PerfilEnum.SUPERVISOR_CMP)) == "SUPERVISOR_CMP"
        assert escopo_de(_supervisor(PerfilEnum.SUPERVISOR_CML)) == "SUPERVISOR_CML"

    def test_consolidadores_de_orgaos_distintos_tem_escopos_distintos(self):
        from app.services.prioridade_service import escopo_de

        assert escopo_de(_consolidador(PerfilEnum.CONSOLIDADOR_DSG)) == "CONSOLIDADOR_DSG"
        assert escopo_de(_consolidador(PerfilEnum.CONSOLIDADOR_COTER)) == "CONSOLIDADOR_COTER"

    def test_solicitantes_tem_sequencia_propria_por_usuario(self):
        from app.services.prioridade_service import escopo_de

        a = _make_user(user_id=7, perfil=PerfilEnum.SOLICITANTE)
        b = _make_user(user_id=9, perfil=PerfilEnum.SOLICITANTE)
        assert escopo_de(a) == "SOLICITANTE:7"
        assert escopo_de(b) == "SOLICITANTE:9"
        assert escopo_de(a) != escopo_de(b)


class TestOrdemDeExibicao:
    """Ordem: quem tem prioridade primeiro; depois leva; depois a prioridade."""

    @staticmethod
    def _sql_ordem():
        from sqlalchemy import select
        from app.models.pedido import Pedido

        return _sql(select(Pedido.id).order_by(*pedidos_router.ordem_recebimento())).upper()

    def test_sem_prioridade_e_o_primeiro_criterio(self):
        """Regressão: pedidos zerados do DEC/DECEx apareciam à frente da lista
        já priorizada do COTER, porque a leva decidia antes."""
        sql = self._sql_ordem()
        assert sql.index("CASE") < sql.index("ENCAMINHADO_EM")

    def test_leva_vem_antes_da_prioridade(self):
        sql = self._sql_ordem()
        assert sql.index("ENCAMINHADO_EM") < sql.index("PRIORIDADE ASC")

    def test_ordem_completa_em_python(self):
        """Mesma regra aplicada a objetos, para conferir o efeito prático."""
        def chave(p):
            return (
                1 if not p.prioridade else 0,
                p.encaminhado_em or datetime.max.replace(tzinfo=timezone.utc),
                p.prioridade or 0,
                p.criado_em,
            )

        st = StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO
        # DEC consolidado ANTES, mas sem prioridade; COTER depois, priorizado.
        dec_zerado = _make_pedido(pedido_id=900, status=st)
        dec_zerado.prioridade = 0
        dec_zerado.encaminhado_em = AGORA
        dec_zerado.criado_em = AGORA

        coter_1 = _make_pedido(pedido_id=100, status=st)
        coter_1.prioridade = 1
        coter_1.encaminhado_em = AGORA + timedelta(days=10)
        coter_1.criado_em = AGORA

        coter_2 = _make_pedido(pedido_id=101, status=st)
        coter_2.prioridade = 2
        coter_2.encaminhado_em = AGORA + timedelta(days=10)
        coter_2.criado_em = AGORA

        ordenados = sorted([dec_zerado, coter_1, coter_2], key=chave)
        # O zerado vai para o fim, mesmo tendo sido consolidado primeiro.
        assert [p.id for p in ordenados] == [100, 101, 900]

    def test_ordem_fila_usa_ordem_de_trabalho(self):
        from sqlalchemy import select
        from app.models.pedido import Pedido

        sql = _sql(select(Pedido.id).order_by(*pedidos_router.ordem_fila())).upper()
        assert "ORDEM_FILA" in sql
