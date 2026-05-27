from datetime import datetime, date
from typing import Literal
from pydantic import BaseModel
from app.models.enums import StatusPedidoEnum, TipoProdutoEnum, EscalaEnum, OrgaoVinculanteEnum


class TransferirPedidosRequest(BaseModel):
    """Requisição de transferência de pedidos para outro usuário da mesma OM."""

    novo_responsavel_id: int


class ItemPedidoCreate(BaseModel):
    tipo_produto: TipoProdutoEnum
    escala: EscalaEnum
    inom: str
    mi: str | None = None
    solicitar_mesmo_disponivel: bool = False
    impressao_quantidade: int | None = None
    impressao_tipo_material: str | None = None
    disponivel_bdgex: bool = False
    data_producao_bdgex: date | None = None


class ItemPedidoOut(BaseModel):
    id: int
    tipo_produto: TipoProdutoEnum
    escala: EscalaEnum
    inom: str
    mi: str | None
    disponivel_bdgex: bool
    data_producao_bdgex: date | None
    solicitar_mesmo_disponivel: bool
    prioridade: int = 0
    impressao_quantidade: int | None = None
    impressao_tipo_material: str | None = None

    model_config = {"from_attributes": True}


class PedidoCreate(BaseModel):
    operacao_id: int | None = None
    data_entrega: date
    finalidade_geo: str | None = None
    finalidade: str | None = None
    orgao_vinculante: OrgaoVinculanteEnum | None = None
    itens: list[ItemPedidoCreate]
    impressao_solicitada: bool = False
    impressao_quantidade: int | None = None
    impressao_tipo_material: str | None = None


class PedidoUpdate(BaseModel):
    operacao_id: int | None = None
    data_entrega: date | None = None
    finalidade_geo: str | None = None
    finalidade: str | None = None


class PedidoOut(BaseModel):
    id: int
    usuario_id: int
    operacao_id: int | None
    data_entrega: date
    status: StatusPedidoEnum
    prioridade: int
    finalidade_geo: str | None = None
    finalidade: str | None
    orgao_vinculante: OrgaoVinculanteEnum
    motivo_reprovacao: str | None
    observacoes: str | None = None
    link_bdgex: str | None = None
    criado_em: datetime
    atualizado_em: datetime
    itens: list[ItemPedidoOut] = []
    regiao_militar: str | None = None
    # Campos enriquecidos (populados nos endpoints, não estão no modelo ORM)
    usuario_nome: str | None = None
    operacao_nome: str | None = None
    criador_id: int | None = None
    criador_nome: str | None = None
    auto_submitted: bool = False
    # Dados de contato do solicitante (enriquecidos pelo _enrich)
    usuario_om: str | None = None
    usuario_email: str | None = None
    usuario_telefone: str | None = None
    usuario_telefone_ritex: str | None = None
    usuario_secao_om: str | None = None
    usuario_perfil: str | None = None
    usuario_posto_graduacao: str | None = None
    usuario_nome_de_guerra: str | None = None
    # Impressão
    impressao_solicitada: bool = False
    impressao_quantidade: int | None = None
    impressao_tipo_material: str | None = None
    # Cadeia de aprovação calculada conforme órgão vinculante e região militar
    cadeia_aprovacao: list[str] = []

    model_config = {"from_attributes": True}


class ReviewPedidoRequest(BaseModel):
    """Requisição de revisão de pedido por gestor intermediário."""

    acao: Literal["aprovar", "editar", "reprovar"]
    """Ação a executar no pedido.

    - ``"aprovar"`` - avança o pedido no fluxo.
    - ``"editar"`` - devolve ao solicitante para ajustes.
    - ``"reprovar"`` - cancela o pedido.
    """
    motivo: str | None = None
    observacoes: str | None = None


class AssignCGEORequest(BaseModel):
    """Requisição de atribuição de pedido a um CGEO (Gestor Cartográfico)."""

    cgeo_id: int


class CGEOReviewRequest(BaseModel):
    """Requisição de análise de viabilidade pelo CGEO."""

    acao: Literal["aprovar", "reprovar", "pronto"]
    """Ação do CGEO.

    - ``"aprovar"`` - confirma o atendimento (ATRIBUIDO_CGEO → APROVADO).
    - ``"reprovar"`` - registra inviabilidade de produção.
    - ``"pronto"`` - entrega concluída, dados disponíveis no BDGEx (APROVADO → PRODUZIDO).
    """
    motivo: str | None = None
    link_bdgex: str | None = None


class ReorderRequest(BaseModel):
    ordered_ids: list[int]


class DuplicateGroup(BaseModel):
    inom: str
    mi: str | None
    tipo_produto: str
    escala: str
    pedidos: list[dict]
