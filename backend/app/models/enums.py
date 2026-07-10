import enum


class PerfilEnum(str, enum.Enum):
    SOLICITANTE          = "SOLICITANTE"

    # Supervisores regionais - um por Comando Militar de Área (CMilA)
    SUPERVISOR_CMP  = "SUPERVISOR_CMP"    # Comando Militar do Planalto
    SUPERVISOR_CML  = "SUPERVISOR_CML"    # Comando Militar do Leste
    SUPERVISOR_CMS  = "SUPERVISOR_CMS"    # Comando Militar do Sul
    SUPERVISOR_CMO  = "SUPERVISOR_CMO"    # Comando Militar do Oeste
    SUPERVISOR_CMAO = "SUPERVISOR_CMAO"   # Comando Militar da Amazônia Oriental
    SUPERVISOR_CMA  = "SUPERVISOR_CMA"    # Comando Militar da Amazônia
    SUPERVISOR_CMNE  = "SUPERVISOR_CMNE"  # Comando Militar do Nordeste
    SUPERVISOR_CMSE = "SUPERVISOR_CMSE"   # Comando Militar do Sudeste

    # Supervisores do DECEx - um por Diretoria/Centro subordinado ao DECEx.
    # Diferente dos supervisores regionais (roteados por Região Militar),
    # estes são roteados pela Diretoria supervisora da OM (campo pedido.diretoria).
    SUPERVISOR_DESMIL  = "SUPERVISOR_DESMIL"   # Diretoria de Ensino Superior Militar
    SUPERVISOR_DETMIL  = "SUPERVISOR_DETMIL"   # Diretoria de Ensino Técnico Militar
    SUPERVISOR_DEPA    = "SUPERVISOR_DEPA"     # Diretoria de Ensino Preparatório e Assistencial
    SUPERVISOR_DPHCEX  = "SUPERVISOR_DPHCEX"   # Diretoria do Patrimônio Histórico e Cultural do Exército
    SUPERVISOR_CCFEX   = "SUPERVISOR_CCFEX"    # Centro de Capacitação Física do Exército

    # Consolidadores por órgão vinculante
    CONSOLIDADOR_COTER  = "CONSOLIDADOR_COTER"
    CONSOLIDADOR_DSG    = "CONSOLIDADOR_DSG"
    CONSOLIDADOR_DEC    = "CONSOLIDADOR_DEC"
    CONSOLIDADOR_COLOG  = "CONSOLIDADOR_COLOG"
    CONSOLIDADOR_DECEX  = "CONSOLIDADOR_DECEX"

    GESTOR_CARTOGRAFICO  = "GESTOR_CARTOGRAFICO"
    ANALISTA_CGEO        = "ANALISTA_CGEO"

    # Legados - mantidos para compatibilidade com dados existentes no banco.
    # Não devem ser atribuídos a novos usuários. Admin deve migrar para os específicos.
    SUPERVISOR   = "SUPERVISOR"
    CONSOLIDADOR = "CONSOLIDADOR"


# ── Sets de conveniência para lógica de negócio ───────────────────────────────

# Supervisores regionais - roteados pela Região Militar (C. Mil. A) do pedido.
SUPERVISOR_REGIONAL_PROFILES: frozenset["PerfilEnum"] = frozenset({
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

# Supervisores do DECEx - roteados pela Diretoria supervisora (pedido.diretoria).
SUPERVISOR_DECEX_PROFILES: frozenset["PerfilEnum"] = frozenset({
    PerfilEnum.SUPERVISOR_DESMIL,
    PerfilEnum.SUPERVISOR_DETMIL,
    PerfilEnum.SUPERVISOR_DEPA,
    PerfilEnum.SUPERVISOR_DPHCEX,
    PerfilEnum.SUPERVISOR_CCFEX,
})

# União — usada em checagens amplas de permissão ("é supervisor").
# Atenção: para roteamento por escalão, use os subconjuntos específicos acima,
# pois supervisores regionais consolidam ao COTER e os do DECEx ao CONSOLIDADOR_DECEX.
SUPERVISOR_PROFILES: frozenset["PerfilEnum"] = (
    SUPERVISOR_REGIONAL_PROFILES | SUPERVISOR_DECEX_PROFILES
)

CONSOLIDADOR_PROFILES: frozenset["PerfilEnum"] = frozenset({
    PerfilEnum.CONSOLIDADOR_COTER,
    PerfilEnum.CONSOLIDADOR_DSG,
    PerfilEnum.CONSOLIDADOR_DEC,
    PerfilEnum.CONSOLIDADOR_COLOG,
    PerfilEnum.CONSOLIDADOR_DECEX,
    PerfilEnum.CONSOLIDADOR,   # legado
})


# Diretoria supervisora do DECEx → perfil de supervisor responsável.
# A chave é o código gravado em pedido.diretoria (ver app.utils.diretorias_decex).
DIRETORIA_TO_SUPERVISOR: dict[str, "PerfilEnum"] = {
    "DESMIL":  PerfilEnum.SUPERVISOR_DESMIL,
    "DETMIL":  PerfilEnum.SUPERVISOR_DETMIL,
    "DEPA":    PerfilEnum.SUPERVISOR_DEPA,
    "DPHCEX":  PerfilEnum.SUPERVISOR_DPHCEX,
    "CCFEX":   PerfilEnum.SUPERVISOR_CCFEX,
}

# Inverso: perfil do supervisor DECEx → código da Diretoria (derivado do mapa acima).
# Usar este mapa (em vez de qualquer campo no usuário) para filtrar pedidos por
# supervisor, pois o perfil é autoritativo (SUPERVISOR_DESMIL → "DESMIL").
SUPERVISOR_DECEX_TO_DIRETORIA: dict["PerfilEnum", str] = {
    v: k for k, v in DIRETORIA_TO_SUPERVISOR.items()
}


class OrgaoVinculanteEnum(str, enum.Enum):
    DSG   = "DSG"
    DCT   = "DCT"   # legado - não mostrar na UI de cadastro, mas mantido no banco
    COTER = "COTER"
    DEC   = "DEC"
    COLOG = "COLOG"
    DECEx = "DECEx"


class StatusPedidoEnum(str, enum.Enum):
    RASCUNHO = "RASCUNHO"
    AGUARDANDO_SUPERVISOR = "AGUARDANDO_SUPERVISOR"
    AGUARDANDO_CONSOLIDADOR = "AGUARDANDO_CONSOLIDADOR"
    # DEVOLVIDO removido do fluxo - mantido apenas para compatibilidade com registros históricos no BD
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
    IMPRESSAO         = "IMPRESSAO"       # Legado - mantido para compatibilidade


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
    TERCEIRO_SGT       = "Terceiro Sargento"
    SEGUNDO_SGT        = "Segundo Sargento"
    PRIMEIRO_SGT       = "Primeiro Sargento"
    SUBTENENTE         = "Subtenente"
    ASPIRANTE          = "Aspirante a Oficial"
    SEGUNDO_TEN        = "Segundo Tenente"
    PRIMEIRO_TEN       = "Primeiro Tenente"
    CAPITAO            = "Capitão"
    MAJOR              = "Major"
    TENENTE_CEL        = "Tenente-Coronel"
    CORONEL            = "Coronel"
