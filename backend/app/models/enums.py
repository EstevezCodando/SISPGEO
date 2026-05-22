import enum


class PerfilEnum(str, enum.Enum):
    SOLICITANTE = "SOLICITANTE"
    SUPERVISOR = "SUPERVISOR"
    CONSOLIDADOR = "CONSOLIDADOR"
    GESTOR_CARTOGRAFICO = "GESTOR_CARTOGRAFICO"
    ANALISTA_CGEO = "ANALISTA_CGEO"


class OrgaoVinculanteEnum(str, enum.Enum):
    DSG   = "DSG"
    DCT   = "DCT"
    COTER = "COTER"
    DEC   = "DEC"
    COLOG = "COLOG"
    DECEx = "DECEx"


class StatusPedidoEnum(str, enum.Enum):
    RASCUNHO = "RASCUNHO"
    AGUARDANDO_SUPERVISOR = "AGUARDANDO_SUPERVISOR"
    AGUARDANDO_CONSOLIDADOR = "AGUARDANDO_CONSOLIDADOR"
    DEVOLVIDO = "DEVOLVIDO"
    AGUARDANDO_CARTOGRAFICO = "AGUARDANDO_CARTOGRAFICO"
    ATRIBUIDO_CGEO = "ATRIBUIDO_CGEO"
    APROVADO = "APROVADO"
    REPROVADO = "REPROVADO"
    CANCELADO = "CANCELADO"
    PRODUZIDO = "PRODUZIDO"


class TipoProdutoEnum(str, enum.Enum):
    CARTA_TOPOGRAFICA = "CARTA_TOPOGRAFICA"
    CARTA_ORTOIMAGEM = "CARTA_ORTOIMAGEM"
    ORTOIMAGEM = "ORTOIMAGEM"
    MDT = "MDT"
    MDS = "MDS"
    CDGV = "CDGV"
    IMPRESSAO = "IMPRESSAO"


class EscalaEnum(str, enum.Enum):
    E25K = "1:25.000"
    E50K = "1:50.000"
    E100K = "1:100.000"
    E250K = "1:250.000"


class TipoJanelaEnum(str, enum.Enum):
    SOLICITANTE = "SOLICITANTE"
    SUPERVISOR = "SUPERVISOR"
    CONSOLIDADOR = "CONSOLIDADOR"
    GESTOR_CARTOGRAFICO = "GESTOR_CARTOGRAFICO"
    ANALISTA_CGEO = "ANALISTA_CGEO"
    GESTOR_CARTOGRAFICO_FINAL = "GESTOR_CARTOGRAFICO_FINAL"


class PostoGraduacaoEnum(str, enum.Enum):
    CIVIL              = "Civil"
    MOT                = "Mão de Obra Temporária"
    SOLDADO_EV         = "Soldado EV"
    SOLDADO_EP         = "Soldado EP"
    CABO               = "Cabo"
    TERCEIRO_SGT       = "Terceiro Sargento"
    SEGUNDO_SGT        = "Segundo Sargento"
    PRIMEIRO_SGT       = "Primeiro Sargento"
    SUBTENENTE         = "Subtenente"
    ASPIRANTE          = "Aspirante"
    SEGUNDO_TEN        = "Segundo Tenente"
    PRIMEIRO_TEN       = "Primeiro Tenente"
    CAPITAO            = "Capitão"
    MAJOR              = "Major"
    TENENTE_CEL        = "Tenente Coronel"
    CORONEL            = "Coronel"
    GEN_BRIGADA        = "General de Brigada"
    GEN_DIVISAO        = "General de Divisão"
    GEN_EXERCITO       = "General de Exército"
