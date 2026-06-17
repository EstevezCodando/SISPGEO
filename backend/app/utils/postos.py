"""Abreviaturas de posto/graduação - espelha PostoGraduacaoEnum."""

POSTO_ABREV: dict[str, str] = {
    "Terceiro Sargento":    "3º Sgt",
    "Segundo Sargento":     "2º Sgt",
    "Primeiro Sargento":    "1º Sgt",
    "Subtenente":           "S Ten",
    "Aspirante a Oficial":  "Asp Of",
    "Segundo Tenente":      "2º Ten",
    "Primeiro Tenente":     "1º Ten",
    "Capitão":              "Cap",
    "Major":                "Maj",
    "Tenente-Coronel":      "Ten Cel",
    "Coronel":              "Cel",
    # Aliases para registros no banco criados antes da padronização
    "Aspirante":            "Asp Of",
    "Tenente Coronel":      "Ten Cel",
}


def abrev_posto(posto: str | None) -> str:
    """Converte valor do enum para abreviatura (ex.: 'Capitão' → 'Cap').
    Retorna string vazia se posto for None/vazio.
    Retorna o valor original se não houver mapeamento (fallback seguro).
    """
    if not posto:
        return ""
    return POSTO_ABREV.get(posto, posto)
