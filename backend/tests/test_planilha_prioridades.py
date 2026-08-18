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


class TestLeituraPlanilha:
    CABECALHO = "Pedido_ID;Nova_Prioridade;Prioridade_Atual\n"

    def test_planilha_valida(self):
        novas, erros = P._ler_planilha(self.CABECALHO + "10;1;5\n20;2;7\n")
        assert novas == {10: 1, 20: 2}
        assert erros == []

    def test_aceita_separador_virgula(self):
        novas, erros = P._ler_planilha("Pedido_ID,Nova_Prioridade\n10,1\n")
        assert novas == {10: 1}
        assert erros == []

    def test_ignora_bom_do_excel(self):
        novas, _ = P._ler_planilha("﻿" + self.CABECALHO + "10;1;5\n")
        assert novas == {10: 1}

    def test_linhas_em_branco_sao_ignoradas(self):
        novas, erros = P._ler_planilha(self.CABECALHO + "10;1;5\n;;\n")
        assert novas == {10: 1} and erros == []

    def test_prioridade_nao_numerica_vira_erro(self):
        _, erros = P._ler_planilha(self.CABECALHO + "10;abc;5\n")
        assert len(erros) == 1 and "inválida" in erros[0]

    def test_prioridade_zero_e_recusada(self):
        _, erros = P._ler_planilha(self.CABECALHO + "10;0;5\n")
        assert len(erros) == 1 and "1 ou maior" in erros[0]

    def test_pedido_repetido_na_planilha_vira_erro(self):
        _, erros = P._ler_planilha(self.CABECALHO + "10;1;5\n10;2;5\n")
        assert len(erros) == 1 and "mais de uma vez" in erros[0]

    def test_coluna_obrigatoria_ausente(self):
        _, erros = P._ler_planilha("Outra;Coisa\n1;2\n")
        assert len(erros) == 1 and "Pedido_ID" in erros[0]

    def test_sem_coluna_nova_prioridade(self):
        _, erros = P._ler_planilha("Pedido_ID;Status\n10;X\n")
        assert len(erros) == 1 and "Nova_Prioridade" in erros[0]

    def test_erros_acumulam_em_vez_de_parar_na_primeira(self):
        _, erros = P._ler_planilha(self.CABECALHO + "10;abc;1\n20;0;1\nxx;1;1\n")
        assert len(erros) == 3
