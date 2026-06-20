"""Constantes compartilhadas entre múltiplos módulos do backend.

Não importa de nenhum módulo interno — sem risco de import circular.
Outros módulos importam daqui; nunca dupliquem esses valores.
"""

# ── Prazos de token de autenticação ──────────────────────────────────────────

RESET_TOKEN_EXPIRY_HOURS: int = 1
"""Validade do token de redefinição de senha (em horas)."""

EMAIL_CONFIRM_TOKEN_EXPIRY_HOURS: int = 24
"""Validade do token de confirmação de e-mail (em horas)."""

# ── Comandos Militares de Área ────────────────────────────────────────────────

CMILA_NAMES: dict[str, str] = {
    "CMA":  "Comando Militar da Amazônia",
    "CMAO": "Comando Militar da Amazônia Oriental",
    "CML":  "Comando Militar do Leste",
    "CMP":  "Comando Militar do Planalto",
    "CMO":  "Comando Militar do Oeste",
    "CMS":  "Comando Militar do Sul",
    "CMNE": "Comando Militar do Nordeste",
    "CMSE": "Comando Militar do Sudeste",
}
"""Nome completo de cada Comando Militar de Área, indexado pela sigla."""


def cmila_label(sigla: str) -> str:
    """Retorna 'Nome Completo (SIGLA)' para e-mails e interfaces.

    Para outros formatos, use ``CMILA_NAMES`` diretamente.
    Siglas desconhecidas retornam 'C Mil. A (SIGLA)'.
    """
    name = CMILA_NAMES.get(sigla)
    return f"{name} ({sigla})" if name else f"C Mil. A ({sigla})"
