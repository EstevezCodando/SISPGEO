"""Busca textual com suporte a termo exato entre aspas.

A busca padrão é por substring, o que confunde siglas com prefixo comum:
procurar por ``DEC`` também traz ``DECEx``, e ``CMA`` também traz ``CMAO``.

Regra: um termo **entre aspas** exige correspondência exata do campo inteiro::

    DEC       → casa com DEC e DECEx   (substring)
    "DEC"     → casa apenas com DEC    (exato)
    "CMA"     → casa apenas com CMA, não com CMAO

Vários termos podem ser combinados e todos precisam casar (E lógico).

Espelha ``frontend/src/utils/busca.ts`` — alterações de semântica devem ser
aplicadas nos dois lados.
"""

import re
import unicodedata
from typing import Iterable, NamedTuple

# Grupo 1/2: conteúdo entre aspas (duplas ou simples). Grupo 3: palavra solta.
_TOKEN_RE = re.compile(r'"([^"]*)"|\'([^\']*)\'|(\S+)')


def normalizar(valor: str) -> str:
    """Remove acentos e caixa para comparação.

    Usa NFKD (e não NFD) porque só a forma de compatibilidade converte os
    indicadores ordinais ``ª``/``º`` — onipresentes na nomenclatura das OM
    ("3ª Bda", "1º CGEO") — nas letras ``a``/``o``.
    """
    decomposto = unicodedata.normalize("NFKD", valor)
    sem_acento = "".join(c for c in decomposto if not unicodedata.combining(c))
    return sem_acento.casefold().strip()


class TermoBusca(NamedTuple):
    texto: str
    exato: bool
    """True quando o termo veio entre aspas → exige campo idêntico."""


def parse_busca(expressao: str) -> list[TermoBusca]:
    """Divide a expressão de busca em termos, respeitando aspas.

    Aspas não fechadas são tratadas como texto comum (o usuário ainda está
    digitando).
    """
    termos: list[TermoBusca] = []
    for aspas_duplas, aspas_simples, solto in _TOKEN_RE.findall(expressao):
        citado = aspas_duplas or aspas_simples
        # findall devolve "" tanto para grupo vazio quanto para não-participante;
        # o termo entre aspas só conta se o token original tinha aspas.
        if solto:
            texto = normalizar(solto.lstrip("\"'"))
            if texto:
                termos.append(TermoBusca(texto, exato=False))
        else:
            texto = normalizar(citado)
            if texto:
                termos.append(TermoBusca(texto, exato=True))
    return termos


def _termo_casa(termo: TermoBusca, campos: Iterable[str | None]) -> bool:
    for campo in campos:
        if campo is None:
            continue
        valor = normalizar(str(campo))
        casou = valor == termo.texto if termo.exato else termo.texto in valor
        if casou:
            return True
    return False


def casa_busca(expressao: str | None, campos: Iterable[str | None]) -> bool:
    """Verifica se um registro atende à expressão de busca.

    Expressão vazia casa com tudo. Todos os termos precisam casar (E lógico).
    """
    if not expressao:
        return True
    termos = parse_busca(expressao)
    if not termos:
        return True
    campos = list(campos)
    return all(_termo_casa(t, campos) for t in termos)
