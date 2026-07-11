"""
Mapeamento OM → Diretoria supervisora do DECEx (SECEx).

O fluxo do órgão vinculante ``DECEx`` possui uma camada de supervisão por
Diretoria/Centro entre o solicitante e o consolidador (DCEX):

    SOLICITANTE (OM) → SUPERVISOR_<DIRETORIA> → CONSOLIDADOR_DECEX → ...

Este módulo determina, a partir do nome da OM do solicitante, qual Diretoria
supervisiona seus pedidos. **Só deve ser consultado quando
``orgao_vinculante == DECEx``** — a mesma OM (ex.: ``20º BIB``) roteia para o
supervisor da sua Região Militar quando o órgão é o COTER, e para o supervisor
DESMil quando o órgão é o DECEx. O discriminador é o ``orgao_vinculante``.

Fonte da verdade: documento ``OMDS e OMV SECEx``. As listas abaixo reproduzem as
OM Subordinadas e Vinculadas de cada Diretoria. Os nomes devem casar com os de
``frontend/src/data/omsData.ts`` (de onde o solicitante seleciona sua OM no
cadastro); a normalização (:func:`_norm`) torna o casamento tolerante a acentos,
``º/ª``, espaços e barras.

Precedência de resolução (para casos em que uma OM host aparece em mais de uma
lista): **OVERRIDES > Subordinada > Vinculada**. Colisões entre vinculadas de
Diretorias diferentes são registradas em log e resolvidas por OVERRIDES.
"""

import logging
import re
import unicodedata

logger = logging.getLogger(__name__)

# Códigos de Diretoria — devem casar com as chaves de
# ``app.models.enums.DIRETORIA_TO_SUPERVISOR``.
DESMIL = "DESMIL"
DETMIL = "DETMIL"
DEPA   = "DEPA"
DPHCEX = "DPHCEX"
CCFEX  = "CCFEX"


# ── Listas oficiais por Diretoria ─────────────────────────────────────────────
# Subordinadas: estabelecimentos de ensino diretamente subordinados (inequívocos).
# Vinculadas:   OM host de NPOR/UETE/OMV cujo ensino é supervisionado pela Diretoria.

_DESMIL_SUBORDINADAS = [
    "ECEME", "EsAO", "AMAN", "BCSv/AMAN", "CEO/AMAN", "B Log Acad", "B Adm/AMAN",
    "EsPCEx", "ESFCEx", "CPOR/RJ", "CPOR/BH", "CPOR/SP", "CPOR/PA", "CPOR/R",
    # Sede da Diretoria (pessoal lotado na própria DESMil):
    "DESMil",
    # Variantes de grafia presentes em frontend/src/data/omsData.ts (aliases):
    "B Log Acad / AMAN", "Ba Adm / AMAN", "ES P C EX", "CPOR/CM - BH",
]
_DESMIL_VINCULADAS = [  # hosts de NPOR (CFOR)
    "1º BIS", "12º B Sup", "4º GACL", "4º GAAAe", "4º BECmb", "2º BFv", "32º GAC",
    "20º RCB", "5º BEC", "Cia C2", "BGP", "18º GAC", "4º BIS", "22º BI", "36º BIMtz",
    "38º BI", "52º BIS", "44º BIMtz", "23º BLogSI", "13º BIB", "20º BIB", "2º BIL",
    "28º BIMec", "33º BIMtz", "62º BI", "5º RCC", "5º GAC AP", "5º BLog",
    "5º BECmb Bld", "9º BECmb", "23º BI", "63º BI", "9º BIMtz", "3º RCMec",
    "19º RCMec", "3º GAC AP", "3º GAAAe", "1º BCom", "12º BE Cmb Bld", "28º GAC",
    "7º BIB", "Pq R Mnt/3ª RM", "9º BLog", "2º BIS", "24º BIS", "25º BC", "2º BEC",
    "34º BIS", "23º BC", "16º BIMtz", "15º BIMtz", "16º RCMec", "72º BIMtz",
    "59º BIMtz", "28º BC", "19º BC", "10º GAC Sl",
]

_DETMIL_SUBORDINADAS = [
    "ESA", "BCSv/ESA", "EsSLog", "EASA", "EsACosAAe", "EsIE", "CEP",
    "CIdEx", "CPAEx", "CEADEx", "CCOPAB",
    # Sede da Diretoria (pessoal lotado na própria DETMil):
    "DETMil",
    # Variantes de grafia presentes em omsData.ts (aliases):
    "Es S Log", "CEP/FDC",
]
_DETMIL_VINCULADAS = [  # OMV (Centros de Instrução hospedados)
    "1º BOPPSC", "1º BPE", "2º BPE", "3º BPE", "4º BPE", "BPEB", "CIArtMsl Fgt",
    "CIAvEx", "CIBld GWP", "CECMA", "2º BFv", "CIGE", "CIGS", "CIOU", "11º BIMth",
    "CIOpEsp", "17º BFron", "72º BIMtz", "CIPqdt GPB", "EsCom", "EsIMEx", "9º B Mnt",
    "2º CGEO", "ENaDCiber", "IEFEx", "CA - Leste",
    # Variantes de grafia da OM host (como cadastradas pelos usuários):
    "CI Bld", "17º B FRON", "CIOU / 11ª Bda Inf Mec",
]
_DETMIL_UETE = [  # UETE (Unidades Escola de Tiro de Emprego) — hosts
    "41º BIMtz", "12º GAC", "13º RCMec", "14º GAC", "10º BIL", "4º GACL",
    "1º GAAAe", "4º BECmb", "6º RCB", "23º BI", "23º BC", "16º BIMtz", "20º RCB",
]

_DEPA_SUBORDINADAS = [  # Colégios Militares
    "CMRJ", "CMM", "CMF", "CMPA", "CMR", "CMC", "CMB", "CMCG", "CMSM", "CMJF",
    "CMBel", "CMSP", "CMS", "CMBH", "CMVM",
    # Sede da Diretoria (pessoal lotado na própria DEPA):
    "DEPA",
]

_DPHCEX_SUBORDINADAS = [
    "AHEx", "BIBLIEx", "MHEx/FC", "MNMSGM",
    # Sede da Diretoria:
    "DPHCEx",
]

_CCFEX_SUBORDINADAS = [
    "CDE", "EsEFEx", "EsEqEx", "IPCFEx", "Bia C Sv/FSJ",
    # Sede do Centro (inclui a grafia com localização):
    "CCFEx", "CCFEx/FSJ",
    # Variantes de grafia presentes em omsData.ts (aliases):
    "Es Eq Ex", "Bia Cmdo Sv/FSJ",
]


# ── Overrides explícitos (maior precedência) ──────────────────────────────────
# Resolvem casos híbridos e colisões documentadas. Chaves em forma NÃO normalizada
# (serão normalizadas ao montar o índice).
#
# Casos híbridos (mesmo Comando, estabelecimentos em Diretorias diferentes):
#   • CPOR/CM-BH: CPOR-BH → DESMil, CMBH → DEPA (nomes distintos, já resolvidos).
#   • EsSLog/CMVM: EsSLog → DETMil, CMVM → DEPA (nomes distintos, já resolvidos).
#
# Colisões host NPOR (DESMil) × UETE (DETMil) — mesma OM host em duas Diretorias.
# Sem informação adicional no pedido, priorizamos a formação de oficiais (NPOR/DESMil).
# Ajuste aqui caso a regra de negócio defina o contrário.
_OVERRIDES: dict[str, str] = {
    "20º RCB":   DESMIL,
    "4º GACL":   DESMIL,
    "1º GAAAe":  DESMIL,
    "4º BECmb":  DESMIL,
    "23º BI":    DESMIL,
    "23º BC":    DESMIL,
    "16º BIMtz": DESMIL,
    "2º BFv":    DESMIL,
    "72º BIMtz": DESMIL,
    # 72º BI de Fortaleza (grafia "Caat") — host do NPOR/72º BIMtz.
    "72º BI Caat": DESMIL,
}


def _norm(s: str) -> str:
    """Normaliza um nome de OM para casamento tolerante.

    - remove acentos e os ordinais ``º/°/ª``;
    - uniformiza traços e barras;
    - colapsa espaços e passa a minúsculas.
    """
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    for ch in ("º", "°", "ª"):
        s = s.replace(ch, "")
    s = s.replace("–", "-").replace("—", "-")
    s = re.sub(r"\s*/\s*", "/", s)   # "BCSv / AMAN" → "bcsv/aman"
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _build_index() -> dict[str, str]:
    """Monta o índice normalizado OM → Diretoria respeitando a precedência.

    Ordem de aplicação (a última vence): Vinculadas → Subordinadas → Overrides.
    Colisões no mesmo nível (vinculadas de Diretorias diferentes) geram warning.
    """
    index: dict[str, str] = {}
    # Chaves resolvidas explicitamente em _OVERRIDES — não geram warning de colisão.
    override_keys = {_norm(k) for k in _OVERRIDES}

    # Nível 1 — Vinculadas (menor precedência)
    vinculadas: list[tuple[list[str], str]] = [
        (_DESMIL_VINCULADAS, DESMIL),
        (_DETMIL_VINCULADAS, DETMIL),
        (_DETMIL_UETE,       DETMIL),
    ]
    for oms, dire in vinculadas:
        for om in oms:
            k = _norm(om)
            if k in index and index[k] != dire:
                if k not in override_keys:
                    logger.warning(
                        "diretorias_decex: colisão de OM vinculada '%s' (%s × %s) — "
                        "mantido %s; defina em _OVERRIDES se necessário.",
                        om, index[k], dire, index[k],
                    )
                continue
            index[k] = dire

    # Nível 2 — Subordinadas (sobrescrevem vinculadas)
    subordinadas: list[tuple[list[str], str]] = [
        (_DESMIL_SUBORDINADAS, DESMIL),
        (_DETMIL_SUBORDINADAS, DETMIL),
        (_DEPA_SUBORDINADAS,   DEPA),
        (_DPHCEX_SUBORDINADAS, DPHCEX),
        (_CCFEX_SUBORDINADAS,  CCFEX),
    ]
    for oms, dire in subordinadas:
        for om in oms:
            index[_norm(om)] = dire

    # Nível 3 — Overrides (maior precedência)
    for om, dire in _OVERRIDES.items():
        index[_norm(om)] = dire

    return index


OM_TO_DIRETORIA: dict[str, str] = _build_index()


def diretoria_de_om(om: str | None) -> str | None:
    """Retorna o código da Diretoria supervisora do DECEx para a OM dada.

    Args:
        om: Nome da OM do solicitante (``current_user.om``).

    Returns:
        Código da Diretoria (``"DESMIL"`` … ``"CCFEX"``) ou ``None`` se a OM não
        estiver mapeada no DECEx.
    """
    if not om:
        return None
    return OM_TO_DIRETORIA.get(_norm(om))
