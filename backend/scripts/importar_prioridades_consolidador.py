"""Aplica a planilha de prioridades de UM consolidador, sem tocar nos demais.

O consolidador envia a sua lista já ordenada (ex.: "Prioridades do COTER.csv",
com as colunas ORDEM e NR PEDIDO #). Este comando lê o arquivo como ele veio —
detectando encoding, separador e nomes de coluna — e grava a ordem no sistema.

Pedidos que não pertencem ao escopo informado são **ignorados**, mesmo que
apareçam na planilha: cada consolidador responde só pela sua própria fila.
Pedidos do escopo que não estiverem na planilha permanecem inalterados.

Modo padrão = PRÉVIA (não altera nada). Para aplicar de fato:

    APLICAR=1 python scripts/importar_prioridades_consolidador.py <arquivo.csv>

Escopo alvo (padrão CONSOLIDADOR_COTER):

    ESCOPO=CONSOLIDADOR_DECEX python scripts/importar_prioridades_consolidador.py <arquivo.csv>
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.pedido import Pedido
from app.models.user import Usuario
from app.routers.prioridades import (
    STATUS_SUBMETIDOS,
    conflitos_de_prioridade,
    decodificar,
    escopo_remetente,
    gravar_prioridades,
    ler_planilha,
)

APLICAR = os.environ.get("APLICAR") == "1"
ESCOPO = os.environ.get("ESCOPO", "CONSOLIDADOR_COTER")


def _linha(pedido_id, atual, nova, om, situacao) -> str:
    return "  %-8s %-5s -> %-5s %-24s %s" % (
        pedido_id, atual if atual else "-", nova, (om or "")[:24], situacao
    )


async def main(caminho: str) -> int:
    with open(caminho, "rb") as f:
        conteudo = decodificar(f.read())

    novas, meta, erros = ler_planilha(conteudo)
    if erros:
        print("ERRO ao ler a planilha:")
        for e in erros:
            print("  -", e)
        return 1
    if not novas:
        print("Nenhuma linha com prioridade numérica na planilha.")
        return 1

    detectadas = meta["colunas_detectadas"]
    print("Arquivo ..............:", os.path.basename(caminho))
    print("Colunas detectadas ...: pedido=%r  prioridade=%r"
          % (detectadas["pedido"], detectadas["prioridade"]))
    print("Linhas com prioridade :", len(novas))
    print("Linhas ignoradas .....:", meta["linhas_ignoradas"],
          "(prioridade não numérica)")
    print("Escopo alvo ..........:", ESCOPO)
    print()

    async with AsyncSessionLocal() as db:
        pedidos = {
            p.id: p for p in await db.scalars(
                select(Pedido).where(Pedido.id.in_(novas.keys()))
            )
        }
        ids_usuarios = {p.usuario_id for p in pedidos.values()} or {0}
        oms = {
            r.id: r.om for r in await db.execute(
                select(Usuario.id, Usuario.om).where(Usuario.id.in_(ids_usuarios))
            )
        }

        # ── Separa o que é do escopo alvo do que não é ───────────────────────
        aplicaveis: dict[int, int] = {}
        sem_mudanca = fora_escopo = nao_encontrado = fora_fluxo = 0
        detalhe: list[str] = []

        for pid, prioridade in sorted(novas.items(), key=lambda kv: kv[1]):
            pedido = pedidos.get(pid)
            if pedido is None:
                nao_encontrado += 1
                detalhe.append(_linha(pid, None, prioridade, "", "NAO ENCONTRADO"))
                continue
            if pedido.status not in STATUS_SUBMETIDOS:
                fora_fluxo += 1
                detalhe.append(_linha(pid, pedido.prioridade, prioridade,
                                      oms.get(pedido.usuario_id), "FORA DO FLUXO"))
                continue

            escopo = escopo_remetente(pedido)
            if escopo != ESCOPO:
                fora_escopo += 1
                detalhe.append(_linha(pid, pedido.prioridade, prioridade,
                                      oms.get(pedido.usuario_id), "IGNORADO (%s)" % escopo))
                continue

            atual = pedido.prioridade or 0
            if atual == prioridade:
                sem_mudanca += 1
                detalhe.append(_linha(pid, atual, prioridade,
                                      oms.get(pedido.usuario_id), "sem mudanca"))
            else:
                detalhe.append(_linha(pid, atual, prioridade,
                                      oms.get(pedido.usuario_id), "ALTERA"))
            aplicaveis[pid] = prioridade

        # Pedidos do escopo que a planilha não citou continuam como estão.
        ausentes = sum(
            1 for p in await db.scalars(
                select(Pedido).where(Pedido.status.in_(STATUS_SUBMETIDOS))
            )
            if escopo_remetente(p) == ESCOPO and p.id not in aplicaveis
        )

        print("  %-8s %-5s    %-5s %-24s %s"
              % ("PEDIDO", "ATUAL", "NOVA", "OM", "SITUACAO"))
        print("  " + "-" * 70)
        for l in detalhe:
            print(l)

        conflitos = conflitos_de_prioridade(aplicaveis, pedidos)

        print()
        print("Resumo:")
        print("  a alterar .............", sum(
            1 for pid, pr in aplicaveis.items() if (pedidos[pid].prioridade or 0) != pr))
        print("  sem mudanca ...........", sem_mudanca)
        print("  ignorados (outro escalao)", fora_escopo)
        print("  nao encontrados .......", nao_encontrado)
        print("  fora do fluxo .........", fora_fluxo)
        print("  ausentes na planilha ..", ausentes, "(permanecem inalterados)")

        if conflitos:
            print()
            print("CONFLITOS - nada sera gravado:")
            for c in conflitos[:20]:
                print("  -", c)
            return 1

        if not aplicaveis:
            print()
            print("Nenhum pedido do escopo %s na planilha. Nada a fazer." % ESCOPO)
            return 0

        if not APLICAR:
            print()
            print("PREVIA - nada foi gravado.")
            print("Para aplicar:  APLICAR=1 ESCOPO=%s python scripts/%s %s"
                  % (ESCOPO, os.path.basename(__file__), os.path.basename(caminho)))
            return 0

        so_aplicaveis = {pid: pedidos[pid] for pid in aplicaveis}
        escopos = await gravar_prioridades(db, aplicaveis, so_aplicaveis, autor_id=None)
        await db.commit()
        print()
        print("APLICADO: %d pedidos gravados em %s"
              % (len(aplicaveis), ", ".join(sorted(escopos))))
        return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        print("Uso: python scripts/importar_prioridades_consolidador.py <arquivo.csv>")
        sys.exit(2)
    sys.exit(asyncio.run(main(sys.argv[1])))
