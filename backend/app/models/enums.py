import enum


class PerfilEnum(str, enum.Enum):
    SOLICITANTE          = "SOLICITANTE"

    # Supervisores regionais — um por Comando Militar de Área (CMilA)
    SUPERVISOR_CMP  = "SUPERVISOR_CMP"    # Comando Militar do Planalto
    SUPERVISOR_CML  = "SUPERVISOR_CML"    # Comando Militar do Leste
    SUPERVISOR_CMS  = "SUPERVISOR_CMS"    # Comando Militar do Sul
    SUPERVISOR_CMO  = "SUPERVISOR_CMO"    # Comando Militar do Oeste
    SUPERVISOR_CMAO = "SUPERVISOR_CMAO"   # Comando Militar da Amazônia Oriental
    SUPERVISOR_CMA  = "SUPERVISOR_CMA"    # Comando Militar da Amazônia
    SUPERVISOR_CMNE  = "SUPERVISOR_CMNE"  # Comando Militar do Nordeste
    SUPERVISOR_CMSE = "SUPERVISOR_CMSE"   # Comando Militar do Sudeste

    # Consolidadores por órgão vinculante
    CONSOLIDADOR_COTER  = "CONSOLIDADOR_COTER"
    CONSOLIDADOR_DSG    = "CONSOLIDADOR_DSG"
    CONSOLIDADOR_DEC    = "CONSOLIDADOR_DEC"
    CONSOLIDADOR_COLOG  = "CONSOLIDADOR_COLOG"
    CONSOLIDADOR_DECEX  = "CONSOLIDADOR_DECEX"

    GESTOR_CARTOGRAFICO  = "GESTOR_CARTOGRAFICO"
    ANALISTA_CGEO        = "ANALISTA_CGEO"

    # Legados — mantidos para compatibilidade com dados existentes no banco.
    # Não devem ser atribuídos a novos usuários. Admin deve migrar para os específicos.
    SUPERVISOR   = "SUPERVISOR"
    CONSOLIDADOR = "CONSOLIDADOR"


# ── Sets de conveniência para lógica de negócio ───────────────────────────────

SUPERVISOR_PROFILES: frozenset["PerfilEnum"] = frozenset({
    PerfilEnum.SUPERVISOR_CMP,
    PerfilEnum.SUPERVISOR_CML,
    PerfilEnum.SUPERVISOR_CMS,
    PerfilEnum.SUPERVISOR_CMO,
    PerfilEnum.SUPERVISOR_CMAO,
    PerfilEnum.SUPERVISOR_CMA,
    PerfilEnum.SUPERVISOR_CMNE,
    PerfilEnum.SUPERVISOR_CMSE,
    PerfilEnum.SUPERVISOR,   # legado
})

CONSOLIDADOR_PROFILES: frozenset["PerfilEnum"] = frozenset({
    PerfilEnum.CONSOLIDADOR_COTER,
    PerfilEnum.CONSOLIDADOR_DSG,
    PerfilEnum.CONSOLIDADOR_DEC,
    PerfilEnum.CONSOLIDADOR_COLOG,
    PerfilEnum.CONSOLIDADOR_DECEX,
    PerfilEnum.CONSOLIDADOR,   # legado
})


class OrgaoVinculanteEnum(str, enum.Enum):
    DSG   = "DSG"
    DCT   = "DCT"   # legado — não mostrar na UI de cadastro, mas mantido no banco
    COTER = "COTER"
    DEC   = "DEC"
    COLOG = "COLOG"
    DECEx = "DECEx"


class StatusPedidoEnum(str, enum.Enum):
    RASCUNHO = "RASCUNHO"
    AGUARDANDO_SUPERVISOR = "AGUARDANDO_SUPERVISOR"
    AGUARDANDO_CONSOLIDADOR = "AGUARDANDO_CONSOLIDADOR"
    # DEVOLVIDO removido do fluxo — mantido apenas para compatibilidade com registros históricos no BD
    DEVOLVIDO = "DEVOLVIDO"
    AGUARDANDO_CARTOGRAFICO = "AGUARDANDO_CARTOGRAFICO"
    ATRIBUIDO_CGEO = "ATRIBUIDO_CGEO"
    APROVADO = "APROVADO"
    REPROVADO = "REPROVADO"
    CANCELADO = "CANCELADO"
    PRODUZIDO = "PRODUZIDO"


class TipoProdutoEnum(str, enum.Enum):
    CARTA_TOPOGRAFICA = "CARTA_TOPOGRAFICA"
    CARTA_ORTOIMAGEM  = "CARTA_ORTOIMAGEM"
    ORTOIMAGEM        = "ORTOIMAGEM"
    MDT               = "MDT"
    MDS               = "MDS"
    CDGV              = "CDGV"
    IMPRESSAO_CT      = "IMPRESSAO_CT"    # Impressão de Carta Topográfica
    IMPRESSAO_COI     = "IMPRESSAO_COI"   # Impressão de Carta Ortoimagem
    IMPRESSAO         = "IMPRESSAO"       # Legado — mantido para compatibilidade


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
