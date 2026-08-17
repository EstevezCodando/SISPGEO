"""
Testes da exportação do cadastro de usuários (``GET /users/export``).
"""

import csv
import io as _io
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.enums import OrgaoVinculanteEnum, PerfilEnum
from app.routers import users as users_router

from .conftest import _make_user


AGORA = datetime.now(timezone.utc)


def _sql(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": True}))


def _db_com_usuarios(usuarios: list) -> AsyncMock:
    db = AsyncMock()
    db.stmts = []

    async def _scalars(stmt, *a, **kw):
        db.stmts.append(stmt)
        return MagicMock(__iter__=MagicMock(return_value=iter(usuarios)))

    db.scalars = AsyncMock(side_effect=_scalars)
    return db


def _usuario(**kw):
    u = _make_user(**{k: v for k, v in kw.items() if k in {
        "user_id", "email", "perfil", "orgao_vinculante", "ativo",
        "nome_de_guerra", "regiao_militar", "cgeo_id",
    }})
    u.nome = kw.get("nome", "Fulano de Tal")
    u.om = kw.get("om", "22º B I")
    u.secao_om = kw.get("secao_om", None)
    u.posto_graduacao = kw.get("posto_graduacao", "Capitão")
    u.telefone = kw.get("telefone", None)
    u.telefone_ritex = kw.get("telefone_ritex", None)
    u.email_confirmado = kw.get("email_confirmado", True)
    u.bloqueado_ate = kw.get("bloqueado_ate", None)
    u.tentativas_login = kw.get("tentativas_login", 0)
    u.ultima_confirmacao_dados = kw.get("ultima_confirmacao_dados", None)
    u.criado_em = kw.get("criado_em", AGORA)
    u.atualizado_em = kw.get("atualizado_em", AGORA)
    return u


async def _csv_do_export(usuarios, **params) -> list[dict]:
    # Chamando a função de rota diretamente, os defaults `Query(...)` não são
    # resolvidos pelo FastAPI — explicita-se cada um.
    filtros = {"regiao_militar": None, "perfil": None, "apenas_ativos": False}
    filtros.update(params)
    db = _db_com_usuarios(usuarios)
    resp = await users_router.exportar_usuarios(db=db, _=None, **filtros)
    corpo = b"".join([c if isinstance(c, bytes) else c.encode("utf-8")
                      async for c in resp.body_iterator]).decode("utf-8")
    assert corpo.startswith("﻿"), "CSV deve começar com BOM para o Excel"
    return list(csv.DictReader(_io.StringIO(corpo[1:]), delimiter=";")), db


# ---------------------------------------------------------------------------
# Situação do cadastro
# ---------------------------------------------------------------------------

class TestSituacaoCadastro:
    def test_ativo(self):
        u = _usuario(ativo=True, email_confirmado=True)
        assert users_router._situacao_cadastro(u, AGORA) == "ATIVO"

    def test_inativo(self):
        u = _usuario(ativo=False, email_confirmado=True)
        assert users_router._situacao_cadastro(u, AGORA) == "INATIVO"

    def test_email_nao_confirmado_tem_precedencia_sobre_inativo(self):
        u = _usuario(ativo=False, email_confirmado=False)
        assert users_router._situacao_cadastro(u, AGORA) == "E-MAIL NAO CONFIRMADO"

    def test_bloqueado_tem_precedencia_sobre_tudo(self):
        u = _usuario(ativo=True, email_confirmado=True,
                     bloqueado_ate=AGORA + timedelta(hours=1))
        assert users_router._situacao_cadastro(u, AGORA) == "BLOQUEADO"

    def test_bloqueio_expirado_nao_conta_mais(self):
        u = _usuario(ativo=True, email_confirmado=True,
                     bloqueado_ate=AGORA - timedelta(hours=1))
        assert users_router._situacao_cadastro(u, AGORA) == "ATIVO"


# ---------------------------------------------------------------------------
# Conteúdo do CSV
# ---------------------------------------------------------------------------

class TestConteudoCSV:
    async def test_cabecalho_e_linha(self):
        u = _usuario(
            user_id=7, nome="Ana Pereira", email="ana@eb.mil.br",
            perfil=PerfilEnum.SOLICITANTE, orgao_vinculante=OrgaoVinculanteEnum.COTER,
            regiao_militar="CMS", ativo=True,
        )
        linhas, _ = await _csv_do_export([u])
        assert len(linhas) == 1
        linha = linhas[0]
        assert linha["ID"] == "7"
        assert linha["Nome"] == "Ana Pereira"
        assert linha["Email"] == "ana@eb.mil.br"
        assert linha["Perfil"] == "SOLICITANTE"
        assert linha["Orgao_Vinculante"] == "COTER"
        assert linha["C_Mil_A"] == "CMS"
        assert linha["C_Mil_A_Nome"] == "C Mil Sul (Porto Alegre)"
        assert linha["Situacao"] == "ATIVO"
        assert linha["Ativo"] == "Sim"
        assert linha["Email_Confirmado"] == "Sim"

    async def test_situacoes_distintas_na_mesma_exportacao(self):
        linhas, _ = await _csv_do_export([
            _usuario(user_id=1, nome="A", ativo=True),
            _usuario(user_id=2, nome="B", ativo=False),
            _usuario(user_id=3, nome="C", ativo=True, email_confirmado=False),
            _usuario(user_id=4, nome="D", ativo=True,
                     bloqueado_ate=AGORA + timedelta(minutes=30)),
        ])
        assert [l["Situacao"] for l in linhas] == [
            "ATIVO", "INATIVO", "E-MAIL NAO CONFIRMADO", "BLOQUEADO",
        ]

    async def test_campos_nulos_viram_string_vazia(self):
        u = _usuario(nome_de_guerra=None, regiao_militar=None, cgeo_id=None)
        u.orgao_vinculante = None
        u.posto_graduacao = None
        linhas, _ = await _csv_do_export([u])
        assert linhas[0]["Nome_de_Guerra"] == ""
        assert linhas[0]["C_Mil_A"] == ""
        assert linhas[0]["C_Mil_A_Nome"] == ""
        assert linhas[0]["Orgao_Vinculante"] == ""
        assert linhas[0]["CGEO"] == ""

    async def test_cgeo_formatado(self):
        linhas, _ = await _csv_do_export([_usuario(cgeo_id=3)])
        assert linhas[0]["CGEO"] == "3º CGEO"

    async def test_lista_vazia_gera_csv_so_com_cabecalho(self):
        linhas, _ = await _csv_do_export([])
        assert linhas == []

    async def test_nome_com_ponto_e_virgula_nao_quebra_colunas(self):
        """Delimitador é ';' — um nome contendo ';' precisa vir escapado."""
        linhas, _ = await _csv_do_export([_usuario(nome="Silva; Souza")])
        assert linhas[0]["Nome"] == "Silva; Souza"
        assert linhas[0]["Email"] == "usuario@eb.mil.br"

    async def test_senha_hash_nao_e_exportada(self):
        linhas, _ = await _csv_do_export([_usuario()])
        assert not any("senha" in c.lower() and "alterada" not in c.lower()
                       for c in linhas[0])


# ---------------------------------------------------------------------------
# Filtros
# ---------------------------------------------------------------------------

class TestFiltrosExport:
    async def test_sem_filtro_nao_restringe(self):
        _, db = await _csv_do_export([_usuario()])
        sql = _sql(db.stmts[0])
        assert "regiao_militar =" not in sql
        assert "ORDER BY usuarios.nome" in sql

    async def test_filtro_por_cmila(self):
        _, db = await _csv_do_export([_usuario()], regiao_militar="CMO")
        assert "regiao_militar = 'CMO'" in _sql(db.stmts[0])

    async def test_filtro_por_perfil(self):
        _, db = await _csv_do_export(
            [_usuario()], perfil=PerfilEnum.CONSOLIDADOR_DEC,
        )
        assert "perfil = 'CONSOLIDADOR_DEC'" in _sql(db.stmts[0])

    async def test_filtro_apenas_ativos(self):
        _, db = await _csv_do_export([_usuario()], apenas_ativos=True)
        assert "ativo IS true" in _sql(db.stmts[0])

    async def test_filtros_combinados(self):
        _, db = await _csv_do_export(
            [_usuario()], regiao_militar="CML", apenas_ativos=True,
        )
        sql = _sql(db.stmts[0])
        assert "regiao_militar = 'CML'" in sql
        assert "ativo IS true" in sql


# ---------------------------------------------------------------------------
# Cabeçalhos HTTP
# ---------------------------------------------------------------------------

class TestRespostaHTTP:
    async def test_content_disposition_e_media_type(self):
        db = _db_com_usuarios([_usuario()])
        resp = await users_router.exportar_usuarios(
            db=db, _=None, regiao_militar=None, perfil=None, apenas_ativos=False,
        )
        assert "text/csv" in resp.media_type
        disp = resp.headers["content-disposition"]
        assert disp.startswith("attachment; filename=usuarios_sispgeo_")
        assert disp.endswith(".csv")
