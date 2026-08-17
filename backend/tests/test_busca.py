"""
Testes da busca textual com termo exato entre aspas (``app.utils.busca``)
e do filtro por Comando Militar de Área em ``GET /pedidos/admin/all``.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.enums import OrgaoVinculanteEnum, PerfilEnum, StatusPedidoEnum
from app.routers import pedidos as pedidos_router
from app.utils.busca import casa_busca, normalizar, parse_busca


# Registros de referência: o par que motivou a correção.
PEDIDO_DEC = ["12", "Cap Silva", "APROVADO", "DEC"]
PEDIDO_DECEX = ["34", "Maj Souza", "APROVADO", "DECEx"]


# ---------------------------------------------------------------------------
# parse_busca
# ---------------------------------------------------------------------------

class TestParseBusca:
    def test_termo_solto_e_substring(self):
        assert parse_busca("DEC") == [("dec", False)]

    def test_termo_entre_aspas_duplas_e_exato(self):
        assert parse_busca('"DEC"') == [("dec", True)]

    def test_termo_entre_aspas_simples_e_exato(self):
        assert parse_busca("'DEC'") == [("dec", True)]

    def test_mistura_de_termos(self):
        assert parse_busca('"DEC" abc') == [("dec", True), ("abc", False)]

    def test_expressao_vazia(self):
        assert parse_busca("   ") == []

    def test_aspas_vazias_sao_ignoradas(self):
        assert parse_busca('""') == []

    def test_aspas_nao_fechadas_viram_substring(self):
        assert parse_busca('"DEC') == [("dec", False)]

    def test_frase_entre_aspas_preserva_espacos(self):
        assert parse_busca('"3ª Bda C Mec"') == [("3a bda c mec", True)]


# ---------------------------------------------------------------------------
# normalizar
# ---------------------------------------------------------------------------

class TestNormalizar:
    @pytest.mark.parametrize("entrada,esperado", [
        ("DEC", "dec"),
        ("Amazônia", "amazonia"),
        ("3ª Bda C Mec", "3a bda c mec"),
        ("1º CGEO", "1o cgeo"),
        ("  DEC  ", "dec"),
        ("Ação", "acao"),
    ])
    def test_normalizacao(self, entrada, esperado):
        assert normalizar(entrada) == esperado


# ---------------------------------------------------------------------------
# casa_busca — o caso DEC vs DECEx
# ---------------------------------------------------------------------------

class TestDecVsDecex:
    def test_substring_traz_os_dois(self):
        assert casa_busca("DEC", PEDIDO_DEC)
        assert casa_busca("DEC", PEDIDO_DECEX)

    def test_aspas_isolam_dec(self):
        assert casa_busca('"DEC"', PEDIDO_DEC)
        assert not casa_busca('"DEC"', PEDIDO_DECEX)

    def test_aspas_isolam_decex(self):
        assert casa_busca('"DECEx"', PEDIDO_DECEX)
        assert not casa_busca('"DECEx"', PEDIDO_DEC)

    def test_exato_ignora_caixa(self):
        assert casa_busca('"dec"', PEDIDO_DEC)

    def test_exato_nao_casa_por_prefixo_do_termo(self):
        assert not casa_busca('"DECE"', PEDIDO_DECEX)


class TestSiglasCMilA:
    def test_cma_substring_traz_cmao(self):
        assert casa_busca("CMA", ["CMAO"])

    def test_cma_entre_aspas_nao_traz_cmao(self):
        assert not casa_busca('"CMA"', ["CMAO"])
        assert casa_busca('"CMA"', ["CMA"])

    def test_cmao_entre_aspas_nao_traz_cma(self):
        assert not casa_busca('"CMAO"', ["CMA"])


class TestCasaBuscaGeral:
    def test_expressao_vazia_casa_com_tudo(self):
        assert casa_busca("", PEDIDO_DECEX)
        assert casa_busca(None, PEDIDO_DECEX)
        assert casa_busca("   ", PEDIDO_DECEX)

    def test_multiplos_termos_sao_e_logico(self):
        assert casa_busca('"DEC" 12', PEDIDO_DEC)
        assert not casa_busca('"DEC" 99', PEDIDO_DEC)

    def test_campos_nulos_nao_quebram(self):
        assert casa_busca("x", [None, None, "texto com x"])
        assert not casa_busca("x", [None, None])

    def test_id_exato_nao_pega_prefixo(self):
        assert not casa_busca('"12"', ["120"])
        assert casa_busca("12", ["120"])

    def test_acentos_sao_ignorados(self):
        assert casa_busca("amazonia", ["C Mil Amazônia"])
        assert casa_busca("Amazônia", ["c mil amazonia"])


# ---------------------------------------------------------------------------
# GET /pedidos/admin/all — filtro por C Mil A e busca livre
# ---------------------------------------------------------------------------

def _pedido_out(pid, *, nome, om, rm, orgao, status=StatusPedidoEnum.APROVADO, inom="SE-22-X-B"):
    p = MagicMock()
    p.id = pid
    p.usuario_nome = nome
    p.usuario_om = om
    p.regiao_militar = rm
    p.orgao_vinculante = orgao
    p.status = status
    item = MagicMock()
    item.inom = inom
    item.mi = "2955-3"
    p.itens = [item]
    return p


async def _chamar_admin_all(pedidos, monkeypatch, **params):
    db = AsyncMock()
    db.stmts = []

    async def _scalars(stmt, *a, **kw):
        db.stmts.append(stmt)
        return MagicMock(__iter__=MagicMock(return_value=iter([])))

    db.scalars = AsyncMock(side_effect=_scalars)

    async def _fake_enrich(_db, _pedidos):
        return pedidos

    monkeypatch.setattr(pedidos_router, "_enrich", _fake_enrich)

    filtros = {"status": None, "orgao_vinculante": None,
               "regiao_militar": None, "q": None}
    filtros.update(params)
    resultado = await pedidos_router.admin_list_all(db=db, _=None, **filtros)
    return resultado, db


class TestAdminListAllFiltros:
    async def test_filtro_regiao_militar_vai_para_o_sql(self, monkeypatch):
        _, db = await _chamar_admin_all([], monkeypatch, regiao_militar="CMO")
        sql = str(db.stmts[0].compile(compile_kwargs={"literal_binds": True}))
        assert "regiao_militar = 'CMO'" in sql

    async def test_sem_filtro_nao_restringe_por_rm(self, monkeypatch):
        _, db = await _chamar_admin_all([], monkeypatch)
        sql = str(db.stmts[0].compile(compile_kwargs={"literal_binds": True}))
        # `regiao_militar` aparece na lista de colunas; o que não pode existir
        # é a restrição.
        assert "regiao_militar =" not in sql
        assert "WHERE" not in sql

    async def test_busca_livre_por_orgao_exato_separa_dec_de_decex(self, monkeypatch):
        pedidos = [
            _pedido_out(1, nome="Cap Silva", om="22 BI", rm="CMP",
                        orgao=OrgaoVinculanteEnum.DEC),
            _pedido_out(2, nome="Maj Souza", om="AMAN", rm="CML",
                        orgao=OrgaoVinculanteEnum.DECEx),
        ]
        somente_dec, _ = await _chamar_admin_all(pedidos, monkeypatch, q='"DEC"')
        assert [p.id for p in somente_dec] == [1]

        ambos, _ = await _chamar_admin_all(pedidos, monkeypatch, q="DEC")
        assert [p.id for p in ambos] == [1, 2]

    async def test_busca_livre_alcanca_cmila(self, monkeypatch):
        pedidos = [
            _pedido_out(1, nome="A", om="X", rm="CMA", orgao=OrgaoVinculanteEnum.COTER),
            _pedido_out(2, nome="B", om="Y", rm="CMAO", orgao=OrgaoVinculanteEnum.COTER),
        ]
        exato, _ = await _chamar_admin_all(pedidos, monkeypatch, q='"CMA"')
        assert [p.id for p in exato] == [1]

    async def test_busca_livre_por_inom(self, monkeypatch):
        pedidos = [
            _pedido_out(1, nome="A", om="X", rm="CMP",
                        orgao=OrgaoVinculanteEnum.COTER, inom="SE-22-X-B-I-3"),
            _pedido_out(2, nome="B", om="Y", rm="CMP",
                        orgao=OrgaoVinculanteEnum.COTER, inom="SF-23-Y-A"),
        ]
        r, _ = await _chamar_admin_all(pedidos, monkeypatch, q="SF-23")
        assert [p.id for p in r] == [2]

    async def test_busca_livre_sem_termo_devolve_tudo(self, monkeypatch):
        pedidos = [
            _pedido_out(1, nome="A", om="X", rm="CMP", orgao=OrgaoVinculanteEnum.COTER),
            _pedido_out(2, nome="B", om="Y", rm="CML", orgao=OrgaoVinculanteEnum.DEC),
        ]
        r, _ = await _chamar_admin_all(pedidos, monkeypatch, q=None)
        assert len(r) == 2
