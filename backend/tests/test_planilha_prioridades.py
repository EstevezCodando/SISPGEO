"""
Testes da reorganização de prioridades por planilha (``/prioridades/planilha``).
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from app.models.enums import OrgaoVinculanteEnum, StatusPedidoEnum
from app.routers import prioridades as P

AGORA = datetime(2026, 8, 18, 12, 0, tzinfo=timezone.utc)


def _pedido(pid, *, status, prioridade, leva_min=0, orgao=OrgaoVinculanteEnum.DSG,
            rm="CMP", usuario_id=1, diretoria=None):
    p = MagicMock()
    p.id = pid
    p.status = status
    p.prioridade = prioridade
    p.orgao_vinculante = orgao
    p.regiao_militar = rm
    p.diretoria = diretoria
    p.usuario_id = usuario_id
    p.encaminhado_em = AGORA + timedelta(minutes=leva_min)
    p.criado_em = AGORA
    return p


class TestEscopoRemetente:
    """De qual escalão veio o pedido, deduzido do status em que ele parou."""

    def test_aguardando_supervisor_veio_do_solicitante(self):
        p = _pedido(1, status=StatusPedidoEnum.AGUARDANDO_SUPERVISOR, prioridade=1, usuario_id=7)
        assert P.escopo_remetente(p) == "SOLICITANTE:7"

    def test_aguardando_consolidador_veio_do_supervisor_da_rm(self):
        p = _pedido(1, status=StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR, prioridade=1, rm="CMS")
        assert P.escopo_remetente(p) == "SUPERVISOR_CMS"

    def test_fluxo_decex_usa_a_diretoria(self):
        p = _pedido(1, status=StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR, prioridade=1,
                    orgao=OrgaoVinculanteEnum.DECEx, diretoria="DESMIL")
        assert P.escopo_remetente(p) == "SUPERVISOR_DESMIL"

    def test_na_dsg_veio_do_consolidador_do_orgao(self):
        p = _pedido(1, status=StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO, prioridade=1,
                    orgao=OrgaoVinculanteEnum.COTER)
        assert P.escopo_remetente(p) == "CONSOLIDADOR_COTER"

    def test_dec_e_decex_nao_se_confundem(self):
        dec = _pedido(1, status=StatusPedidoEnum.APROVADO, prioridade=1,
                      orgao=OrgaoVinculanteEnum.DEC)
        decex = _pedido(2, status=StatusPedidoEnum.APROVADO, prioridade=1,
                        orgao=OrgaoVinculanteEnum.DECEx)
        assert P.escopo_remetente(dec) == "CONSOLIDADOR_DEC"
        assert P.escopo_remetente(decex) == "CONSOLIDADOR_DECEX"


class TestSequenciasCorrigidas:
    """A coluna Nova_Prioridade nasce sem duplicatas, preservando a ordem exibida."""

    def test_cenario_real_das_quatro_levas(self):
        """Reproduz o passivo de produção: 1006/1020 em 8 e 1023/1032 em 9."""
        st = StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO
        pedidos = [
            _pedido(1031, status=st, prioridade=1, leva_min=0),
            _pedido(1041, status=st, prioridade=2, leva_min=0),
            _pedido(1034, status=st, prioridade=3, leva_min=0),
            _pedido(1006, status=st, prioridade=8, leva_min=1),
            _pedido(1023, status=st, prioridade=9, leva_min=2),
            _pedido(1020, status=st, prioridade=8, leva_min=3),
            _pedido(1032, status=st, prioridade=9, leva_min=3),
            _pedido(1019, status=st, prioridade=10, leva_min=3),
        ]
        novas = P.sequencias_corrigidas(pedidos)
        assert novas == {
            1031: 1, 1041: 2, 1034: 3, 1006: 4,
            1023: 5, 1020: 6, 1032: 7, 1019: 8,
        }
        assert len(set(novas.values())) == len(novas)

    def test_cada_escalao_tem_sequencia_propria(self):
        pedidos = [
            _pedido(1, status=StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO,
                    prioridade=5, orgao=OrgaoVinculanteEnum.COTER),
            _pedido(2, status=StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO,
                    prioridade=9, orgao=OrgaoVinculanteEnum.DSG),
        ]
        novas = P.sequencias_corrigidas(pedidos)
        # Escalões distintos → ambos começam em 1, sem conflito entre si.
        assert novas == {1: 1, 2: 1}

    def test_pedido_sem_prioridade_vai_para_o_fim(self):
        st = StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO
        pedidos = [
            _pedido(1, status=st, prioridade=0, leva_min=0),
            _pedido(2, status=st, prioridade=1, leva_min=0),
        ]
        novas = P.sequencias_corrigidas(pedidos)
        assert novas[2] == 1 and novas[1] == 2


class TestDeteccaoDeColunas:
    """A planilha vem como o consolidador montou — nomes de coluna variam."""

    def test_cabecalho_real_do_coter(self):
        cabecalhos = ["ORDEM", "NR PEDIDO #", "MILITAR", "OM", "CMDO MILITAR",
                      "FINALIDADE", "CONSOLIDAÇÃO EM", ""]
        assert P.detectar_colunas(cabecalhos) == ("NR PEDIDO #", "ORDEM")

    def test_cabecalho_da_nossa_exportacao(self):
        assert P.detectar_colunas(P.COLUNAS) == ("Pedido_ID", "Nova_Prioridade")

    def test_sequencia_nao_e_confundida_com_prioridade(self):
        """`Sequencia`, na nossa exportação, guarda o escopo — não um número."""
        _, prio = P.detectar_colunas(["Pedido_ID", "Sequencia", "Nova_Prioridade"])
        assert prio == "Nova_Prioridade"

    @pytest.mark.parametrize("cabecalho", [
        "NR PEDIDO", "Nº do Pedido", "PEDIDO", "Pedido_ID", "ID",
    ])
    def test_apelidos_da_coluna_de_pedido(self, cabecalho):
        assert P.detectar_colunas([cabecalho, "ORDEM"])[0] == cabecalho

    @pytest.mark.parametrize("cabecalho", [
        "ORDEM", "Prioridade", "PRIO", "Nova_Prioridade",
    ])
    def test_apelidos_da_coluna_de_prioridade(self, cabecalho):
        assert P.detectar_colunas(["Pedido_ID", cabecalho])[1] == cabecalho

    def test_coluna_vazia_no_fim_e_ignorada(self):
        """O arquivo do COTER termina com uma coluna sem nome."""
        assert P.detectar_colunas(
            ["ORDEM", "NR PEDIDO #", "", "   "]
        ) == ("NR PEDIDO #", "ORDEM")

    def test_nao_identifica_o_que_nao_existe(self):
        assert P.detectar_colunas(["Outra", "Coisa"]) == (None, None)


class TestEncodingESeparador:
    def test_cp1252_do_excel_pt_br(self):
        """O arquivo real do COTER é ANSI — falha em UTF-8."""
        bruto = "ORDEM,NR PEDIDO #\nOperação Militar,1144\n".encode("cp1252")
        with pytest.raises(UnicodeDecodeError):
            bruto.decode("utf-8")
        assert "Operação Militar" in P.decodificar(bruto)

    def test_utf8_com_bom(self):
        bruto = "﻿Pedido_ID;Nova_Prioridade\n10;1\n".encode("utf-8-sig")
        assert P.decodificar(bruto).lstrip("﻿").startswith("Pedido_ID")

    @pytest.mark.parametrize("cabecalho,esperado", [
        ("ORDEM,NR PEDIDO #,OM", ","),
        ("Pedido_ID;Nova_Prioridade;OM", ";"),
        ("Pedido_ID\tNova_Prioridade", "\t"),
    ])
    def test_separador(self, cabecalho, esperado):
        assert P.detectar_separador(cabecalho) == esperado


class TestLeituraPlanilha:
    COTER = "ORDEM,NR PEDIDO #,MILITAR,OM\n"

    def test_planilha_do_coter(self):
        novas, meta, erros = P.ler_planilha(
            self.COTER
            + "1,1144,Maj Lacerda,Cmdo CMAO\n"
            + "2,1143,Maj Lacerda,Cmdo CMAO\n"
        )
        assert novas == {1144: 1, 1143: 2}
        assert erros == []
        assert meta["colunas_detectadas"] == {
            "pedido": "NR PEDIDO #", "prioridade": "ORDEM",
        }

    def test_linha_xx_e_ignorada_em_silencio(self):
        """O COTER marca com "XX" o pedido a excluir — não é erro."""
        novas, meta, erros = P.ler_planilha(
            self.COTER
            + "1,1144,Maj Lacerda,Cmdo CMAO\n"
            + "XX,1132,3 Sgt Falconi,C Fron JAURU\n"
        )
        assert novas == {1144: 1}
        assert erros == []
        assert meta["linhas_ignoradas"] == 1

    def test_nossa_exportacao_continua_sendo_lida(self):
        novas, _, erros = P.ler_planilha(
            "Pedido_ID;Nova_Prioridade;Prioridade_Atual\n10;1;5\n20;2;7\n"
        )
        assert novas == {10: 1, 20: 2} and erros == []

    def test_colunas_forcadas_vencem_a_deteccao(self):
        novas, meta, _ = P.ler_planilha(
            "A,B\n7,3\n", coluna_pedido="A", coluna_prioridade="B",
        )
        assert novas == {7: 3}
        assert meta["colunas_detectadas"] == {"pedido": "A", "prioridade": "B"}

    def test_linhas_em_branco_nao_contam_como_ignoradas(self):
        novas, meta, erros = P.ler_planilha(self.COTER + "1,1144,x,y\n,,,\n")
        assert novas == {1144: 1} and erros == []
        assert meta["linhas_ignoradas"] == 0

    def test_prioridade_zero_vira_erro(self):
        """Zero é numérico — diferente de "XX", é engano e merece ser apontado."""
        _, _, erros = P.ler_planilha(self.COTER + "0,1144,x,y\n")
        assert len(erros) == 1 and "1 ou maior" in erros[0]

    def test_pedido_nao_numerico_vira_erro(self):
        _, _, erros = P.ler_planilha(self.COTER + "1,abc,x,y\n")
        assert len(erros) == 1 and "inválido" in erros[0]

    def test_pedido_repetido_vira_erro(self):
        _, _, erros = P.ler_planilha(self.COTER + "1,1144,x,y\n2,1144,x,y\n")
        assert len(erros) == 1 and "mais de uma vez" in erros[0]

    def test_colunas_irreconheciveis_explicam_o_que_foi_encontrado(self):
        _, _, erros = P.ler_planilha("Outra;Coisa\n1;2\n")
        assert len(erros) == 1
        assert "Outra" in erros[0] and "Coisa" in erros[0]

    def test_erros_acumulam_em_vez_de_parar_no_primeiro(self):
        _, _, erros = P.ler_planilha(self.COTER + "0,10,x,y\n1,abc,x,y\n")
        assert len(erros) == 2


class TestConflitosDePrioridade:
    def test_mesmo_numero_no_mesmo_escalao_e_conflito(self):
        st = StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO
        pedidos = {
            1: _pedido(1, status=st, prioridade=0, orgao=OrgaoVinculanteEnum.COTER),
            2: _pedido(2, status=st, prioridade=0, orgao=OrgaoVinculanteEnum.COTER),
        }
        assert P.conflitos_de_prioridade({1: 5, 2: 5}, pedidos)

    def test_mesmo_numero_em_escaloes_distintos_e_permitido(self):
        st = StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO
        pedidos = {
            1: _pedido(1, status=st, prioridade=0, orgao=OrgaoVinculanteEnum.COTER),
            2: _pedido(2, status=st, prioridade=0, orgao=OrgaoVinculanteEnum.DSG),
        }
        assert P.conflitos_de_prioridade({1: 5, 2: 5}, pedidos) == []


class TestRegraDeReconstrucao:
    """A regra muda conforme as prioridades do escalão sobreviveram ou não.

    Descoberto ao auditar o dump: só o consolidador DSG tinha numeração
    corrompida. Nos demais escalões as prioridades estavam íntegras, e ordenar
    por leva as invertia — inclusive porque ``submit_pedido`` grava um horário
    por pedido, então uma leva única aparece com horários diferentes.
    """

    def test_detecta_prioridades_integras(self):
        ps = [_pedido(i, status=StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO, prioridade=n)
              for i, n in [(1, 1), (2, 2), (3, 3)]]
        assert P.prioridades_integras(ps) is True

    def test_detecta_prioridades_repetidas(self):
        ps = [_pedido(i, status=StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO, prioridade=n)
              for i, n in [(1, 8), (2, 8)]]
        assert P.prioridades_integras(ps) is False

    def test_prioridade_zero_nao_conta_como_integra(self):
        ps = [_pedido(1, status=StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO, prioridade=0)]
        assert P.prioridades_integras(ps) is False

    def test_escalao_integro_preserva_a_ordem_da_prioridade(self):
        """Caso real do SUPERVISOR_CMP: prioridades 1..7 fora da ordem de envio.

        Os horários crescem de 1030 a 1040, mas a prioridade escolhida foi
        outra — é a prioridade que vale.
        """
        st = StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR
        pedidos = [
            _pedido(1030, status=st, prioridade=1, leva_min=0),
            _pedido(1036, status=st, prioridade=5, leva_min=10),
            _pedido(1008, status=st, prioridade=7, leva_min=20),
            _pedido(1022, status=st, prioridade=6, leva_min=21),
            _pedido(1024, status=st, prioridade=4, leva_min=22),
            _pedido(1025, status=st, prioridade=3, leva_min=23),
            _pedido(1040, status=st, prioridade=2, leva_min=24),
        ]
        novas = P.sequencias_corrigidas(pedidos)
        ordem = sorted(novas, key=novas.get)
        assert ordem == [1030, 1040, 1025, 1024, 1036, 1022, 1008]
        # Renumeração é idempotente quando já estava íntegra.
        assert novas == {1030: 1, 1040: 2, 1025: 3, 1024: 4, 1036: 5, 1022: 6, 1008: 7}

    def test_solicitante_integro_nao_e_invertido_pela_ordem_de_envio(self):
        """Caso real do SOLICITANTE:4 — enviou em ordem inversa à prioridade."""
        st = StatusPedidoEnum.AGUARDANDO_SUPERVISOR
        pedidos = [
            _pedido(1044, status=st, prioridade=3, leva_min=0, usuario_id=4),
            _pedido(1046, status=st, prioridade=2, leva_min=8, usuario_id=4),
            _pedido(1047, status=st, prioridade=1, leva_min=12, usuario_id=4),
        ]
        novas = P.sequencias_corrigidas(pedidos)
        assert sorted(novas, key=novas.get) == [1047, 1046, 1044]

    def test_escalao_corrompido_usa_a_leva(self):
        """Caso real do CONSOLIDADOR_DSG: 1006/1020 em 8 e 1023/1032 em 9."""
        st = StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO
        pedidos = [
            _pedido(1031, status=st, prioridade=1, leva_min=0),
            _pedido(1041, status=st, prioridade=2, leva_min=0),
            _pedido(1034, status=st, prioridade=3, leva_min=0),
            _pedido(1006, status=st, prioridade=8, leva_min=1),
            _pedido(1023, status=st, prioridade=9, leva_min=2),
            _pedido(1020, status=st, prioridade=8, leva_min=3),
            _pedido(1032, status=st, prioridade=9, leva_min=3),
            _pedido(1019, status=st, prioridade=10, leva_min=3),
        ]
        novas = P.sequencias_corrigidas(pedidos)
        assert sorted(novas, key=novas.get) == [
            1031, 1041, 1034, 1006, 1023, 1020, 1032, 1019,
        ]

    def test_cada_escalao_aplica_a_sua_propria_regra(self):
        """Um escalão íntegro e outro corrompido, no mesmo lote."""
        integro = [
            _pedido(1, status=StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO,
                    prioridade=2, leva_min=0, orgao=OrgaoVinculanteEnum.COTER),
            _pedido(2, status=StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO,
                    prioridade=1, leva_min=5, orgao=OrgaoVinculanteEnum.COTER),
        ]
        corrompido = [
            _pedido(3, status=StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO,
                    prioridade=1, leva_min=0, orgao=OrgaoVinculanteEnum.DSG),
            _pedido(4, status=StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO,
                    prioridade=1, leva_min=5, orgao=OrgaoVinculanteEnum.DSG),
        ]
        novas = P.sequencias_corrigidas(integro + corrompido)
        assert novas[2] == 1 and novas[1] == 2      # COTER: pela prioridade
        assert novas[3] == 1 and novas[4] == 2      # DSG: pela leva
