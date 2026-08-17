"""
Testes das prioridades atribuídas por Supervisor e Consolidador.

Cobrem os endpoints ``PUT /pedidos/reorder`` e ``PUT /pedidos/{id}/items/reorder``
e as regras de escopo que impedem um escalão de reordenar pedidos de outro.

As funções de rota são chamadas diretamente com uma AsyncSession mockada; as
cláusulas SQLAlchemy geradas são compiladas para texto e inspecionadas.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.models.enums import OrgaoVinculanteEnum, PerfilEnum, StatusPedidoEnum
from app.routers import pedidos as pedidos_router
from app.schemas.pedido import ReorderRequest

from .conftest import _make_pedido, _make_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sql(clause) -> str:
    """Compila uma cláusula/statement SQLAlchemy com os literais embutidos."""
    return str(clause.compile(compile_kwargs={"literal_binds": True}))


def _db_capturando_updates(rowcount: int = 1):
    """AsyncSession mockada que registra cada statement passado a ``execute``."""
    db = AsyncMock()
    db.commit = AsyncMock()
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
        # ordered_ids[0] recebe prioridade 1 (maior prioridade)
        assert "prioridade=1" in sqls[0].replace(" ", "") and "id = 30" in sqls[0]
        assert "prioridade=2" in sqls[1].replace(" ", "") and "id = 10" in sqls[1]
        assert "prioridade=3" in sqls[2].replace(" ", "") and "id = 20" in sqls[2]

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
    async def test_consolidate_preserva_prioridade_do_supervisor(self):
        """Ao encaminhar do supervisor ao consolidador, a ordem definida pelo
        supervisor deve permanecer gravada no pedido (não é zerada)."""
        from unittest.mock import patch
        from app.services import pedido_service

        p = _make_pedido(status=StatusPedidoEnum.AGUARDANDO_SUPERVISOR)
        p.regiao_militar = "CMP"
        p.prioridade = 3

        db = AsyncMock()
        db.commit = AsyncMock()
        db.get = AsyncMock(return_value=p)
        db.scalars = AsyncMock(return_value=MagicMock(
            __iter__=MagicMock(return_value=iter([]))
        ))

        with patch("app.services.pedido_service.NotificationService") as svc_cls:
            svc_cls.return_value = AsyncMock()
            r = await pedido_service.consolidate_pedidos(db, [p.id], _supervisor())

        assert r["submetidos"] == 1
        assert p.status == StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR
        assert p.prioridade == 3


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
