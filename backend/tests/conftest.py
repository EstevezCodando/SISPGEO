"""
Fixtures compartilhadas para os testes do SISGEO.

Estratégia: testes de serviço usam MagicMock em vez de instâncias ORM reais,
evitando dependência de banco de dados. Os mocks expõem os atributos
necessários via atribuição direta, que os MagicMocks suportam naturalmente.
"""

import pytest
from datetime import datetime, date, timezone
from unittest.mock import AsyncMock, MagicMock

from app.models.enums import (
    OrgaoVinculanteEnum, EscalaEnum, PerfilEnum,
    StatusPedidoEnum, TipoProdutoEnum,
)
from app.models.pedido import ItemPedido, Pedido
from app.models.user import Usuario


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(
    user_id: int = 1,
    email: str = "usuario@eb.mil.br",
    perfil: PerfilEnum = PerfilEnum.SOLICITANTE,
    orgao_vinculante: OrgaoVinculanteEnum = OrgaoVinculanteEnum.COTER,
    ativo: bool = True,
    nome_de_guerra: str | None = "Teste",
    regiao_militar: str | None = None,
    cgeo_id: int | None = None,
) -> MagicMock:
    """Cria um mock de :class:`Usuario` sem persistência no banco."""
    u = MagicMock(spec=Usuario)
    u.id = user_id
    u.nome = "Usuário Teste"
    u.nome_de_guerra = nome_de_guerra
    u.email = email
    u.perfil = perfil
    u.orgao_vinculante = orgao_vinculante
    u.om = "22º B I"
    u.ativo = ativo
    u.email_confirmado = True
    u.tentativas_login = 0
    u.bloqueado_ate = None
    u.ultima_senha_alterada = datetime.now(timezone.utc)
    u.regiao_militar = regiao_militar
    # Explícito para não virar MagicMock truthy nas comparações de escopo do CGEO.
    u.cgeo_id = cgeo_id
    return u


def _make_item() -> MagicMock:
    item = MagicMock(spec=ItemPedido)
    item.id = 1
    item.tipo_produto = TipoProdutoEnum.CARTA_TOPOGRAFICA
    item.escala = EscalaEnum.E50K
    item.inom = "SE-22-X-B-I-3"
    item.mi = "2955-3"
    item.disponivel_bdgex = False
    item.data_producao_bdgex = None
    item.solicitar_mesmo_disponivel = False
    # Sem estes, o MagicMock(spec=...) devolve um mock truthy e o pedido é tratado
    # como "sem itens ativos" pelas validações de submit/consolidação.
    item.removido = False
    item.prioridade = 0
    return item


def _make_pedido(
    pedido_id: int = 1,
    usuario_id: int = 1,
    status: StatusPedidoEnum = StatusPedidoEnum.RASCUNHO,
    orgao_vinculante: OrgaoVinculanteEnum = OrgaoVinculanteEnum.COTER,
    with_items: bool = True,
) -> MagicMock:
    """Cria um mock de :class:`Pedido` sem persistência."""
    p = MagicMock(spec=Pedido)
    p.id = pedido_id
    p.usuario_id = usuario_id
    p.status = status
    p.orgao_vinculante = orgao_vinculante
    p.operacao_id = None
    p.data_entrega = date(2025, 12, 31)
    p.finalidade = "Treinamento"
    p.prioridade = 1
    p.ordem_fila = 1
    p.encaminhado_em = None
    p.motivo_reprovacao = None
    p.observacoes = None
    p.submetido_gestor_em = None
    p.submetido_dsg_em = None
    p.cancelado_em = None
    p.aprovado_em = None
    p.gestor_demandante_id = None
    p.gestor_dsg_id = None
    p.cgeo_id = None
    # regiao_militar necessário para roteamento COTER → SUPERVISOR_CMP em submit_pedido
    p.regiao_militar = "CMP"
    # diretoria só é usada no fluxo DECEx; None nos demais (evita MagicMock truthy)
    p.diretoria = None
    p.itens = [_make_item()] if with_items else []
    return p


# ---------------------------------------------------------------------------
# Fixtures — banco de dados
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def ciclo_fixo(monkeypatch):
    """Fixa o ciclo do PIT nos testes de serviço.

    ``ciclo_atual`` lê ConfigEntrega via ``db.get``, e a AsyncSession mockada
    devolve o mesmo objeto para qualquer ``get`` — o que traria um Pedido no
    lugar da configuração. Os testes de fluxo não dependem do ano; os que
    exercitam a sequência de prioridades usam a função real.
    """
    from app.services import prioridade_service

    async def _ciclo(_db):
        return 2026

    monkeypatch.setattr(prioridade_service, "ciclo_atual", _ciclo)


@pytest.fixture
def mock_db():
    """AsyncSession mockada com os métodos mais usados nos serviços."""
    db = AsyncMock()
    db.add = MagicMock()            # síncrono no SQLAlchemy
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.delete = AsyncMock()
    db.get = AsyncMock(return_value=None)
    db.scalar = AsyncMock(return_value=None)
    db.scalars = AsyncMock(return_value=MagicMock(
        __iter__=MagicMock(return_value=iter([]))
    ))
    return db


# ---------------------------------------------------------------------------
# Fixtures — usuários
# ---------------------------------------------------------------------------

@pytest.fixture
def usuario_omds() -> MagicMock:
    """Mock de usuário com perfil SOLICITANTE."""
    return _make_user(perfil=PerfilEnum.SOLICITANTE)


@pytest.fixture
def gestor_brigada() -> MagicMock:
    """Mock de usuário com perfil SUPERVISOR (legado) — Região Militar CMP, alinhado com pedido_submetido_brigada."""
    return _make_user(user_id=2, email="supervisor@eb.mil.br", perfil=PerfilEnum.SUPERVISOR, regiao_militar="CMP")


@pytest.fixture
def solicitante_decex_desmil() -> MagicMock:
    """Solicitante do DECEx cuja OM (AMAN) é supervisionada pela DESMil."""
    u = _make_user(
        user_id=20, email="solicitante.decex@eb.mil.br",
        perfil=PerfilEnum.SOLICITANTE, orgao_vinculante=OrgaoVinculanteEnum.DECEx,
        regiao_militar="CML",
    )
    u.om = "AMAN"
    return u


@pytest.fixture
def supervisor_desmil() -> MagicMock:
    """Supervisor da Diretoria DESMil (fluxo DECEx)."""
    return _make_user(
        user_id=21, email="supervisor.desmil@eb.mil.br",
        perfil=PerfilEnum.SUPERVISOR_DESMIL, orgao_vinculante=OrgaoVinculanteEnum.DECEx,
    )


@pytest.fixture
def pedido_decex_desmil_rascunho(solicitante_decex_desmil) -> MagicMock:
    """Pedido RASCUNHO de solicitante DECEx (OM→DESMil), diretoria ainda não gravada."""
    p = _make_pedido(
        pedido_id=200, usuario_id=solicitante_decex_desmil.id,
        orgao_vinculante=OrgaoVinculanteEnum.DECEx,
    )
    p.diretoria = None
    return p


@pytest.fixture
def pedido_decex_desmil_aguardando(solicitante_decex_desmil) -> MagicMock:
    """Pedido AGUARDANDO_SUPERVISOR do fluxo DECEx, diretoria=DESMIL."""
    p = _make_pedido(
        pedido_id=201, usuario_id=solicitante_decex_desmil.id,
        status=StatusPedidoEnum.AGUARDANDO_SUPERVISOR,
        orgao_vinculante=OrgaoVinculanteEnum.DECEx,
    )
    p.diretoria = "DESMIL"
    return p


@pytest.fixture
def gestor_dsg() -> MagicMock:
    """Mock de usuário com perfil GESTOR_CARTOGRAFICO."""
    return _make_user(user_id=10, email="dsg@eb.mil.br", perfil=PerfilEnum.GESTOR_CARTOGRAFICO)


@pytest.fixture
def gestor_cgeo() -> MagicMock:
    """Mock de usuário com perfil ANALISTA_CGEO (1º CGEO)."""
    return _make_user(
        user_id=11, email="cgeo@eb.mil.br", perfil=PerfilEnum.ANALISTA_CGEO, cgeo_id=1,
    )


# ---------------------------------------------------------------------------
# Fixtures — pedidos
# ---------------------------------------------------------------------------

@pytest.fixture
def pedido_rascunho(usuario_omds) -> MagicMock:
    """Mock de pedido em estado RASCUNHO pertencente a usuario_omds."""
    return _make_pedido(usuario_id=usuario_omds.id)


@pytest.fixture
def pedido_submetido_brigada(usuario_omds) -> MagicMock:
    """Mock de pedido com status AGUARDANDO_SUPERVISOR."""
    return _make_pedido(usuario_id=usuario_omds.id, status=StatusPedidoEnum.AGUARDANDO_SUPERVISOR)


@pytest.fixture
def pedido_submetido_dsg(usuario_omds) -> MagicMock:
    """Mock de pedido com status AGUARDANDO_CARTOGRAFICO (pronto para atribuição ao CGEO)."""
    return _make_pedido(usuario_id=usuario_omds.id, status=StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO)


@pytest.fixture
def pedido_atribuido_cgeo(usuario_omds) -> MagicMock:
    """Mock de pedido com status ATRIBUIDO_CGEO, atribuído ao 1º CGEO (ver gestor_cgeo)."""
    p = _make_pedido(usuario_id=usuario_omds.id, status=StatusPedidoEnum.ATRIBUIDO_CGEO)
    p.cgeo_id = 1
    return p
