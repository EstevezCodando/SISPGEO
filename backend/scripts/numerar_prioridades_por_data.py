"""Numera pedidos sem prioridade pela data em que foram consolidados.

Alguns pedidos ficaram com ``prioridade = 0`` porque foram encaminhados antes
da correção do carimbo automático. Sem número, eles não têm ordem própria — e
até a mudança na regra de exibição chegavam a aparecer à frente de listas já
priorizadas.

Este comando resolve o passivo sem depender de planilha: dentro de cada
escalão, ordena os zerados por ``encaminhado_em`` (a data em que o órgão
consolidou o envio) e carimba a sequência **continuando de onde a numeração
daquele escalão parou** — pedidos que já têm prioridade não são tocados.

Modo padrão = PRÉVIA (não altera nada). Para aplicar de fato:

    APLICAR=1 python scripts/numerar_prioridades_por_data.py

Por padrão processa todos os escalões que tenham pedidos zerados, cada um com
a sua própria sequência. Para restringir a um só:

    ESCOPO=CONSOLIDADOR_DEC python scripts/numerar_prioridades_por_data.py
"""

import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.pedido import Pedido
from app.models.user import Usuario
from app.routers.prioridades import (
    STATUS_SUBMETIDOS,
    conflitos_de_prioridade,
    escopo_remetente,
    gravar_prioridades,
)

APLICAR = os.environ.get("APLICAR") == "1"
ESCOPO = os.environ.get("ESCOPO") or None

# Sem data de consolidação, o pedido vai para o fim da fila do seu escalão.
_SEM_DATA = datetime.max.replace(tzinfo=timezone.utc)


async def main() -> int:
    async with AsyncSessionLocal() as db:
        pedidos = list(await db.scalars(
            select(Pedido).where(Pedido.status.in_(STATUS_SUBMETIDOS))
        ))
        oms = {
            r.id: r.om for r in await db.execute(
                select(Usuario.id, Usuario.om).where(
                    Usuario.id.in_({p.usuario_id for p in pedidos} or {0})
                )
            )
        }

        # ── Agrupa por escalão ───────────────────────────────────────────────
        por_escopo: dict[str, list[Pedido]] = {}
        for p in pedidos:
            escopo = escopo_remetente(p)
            if ESCOPO and escopo != ESCOPO:
                continue
            por_escopo.setdefault(escopo, []).append(p)

        if not por_escopo:
            print("Nenhum pedido encontrado%s." % (f" no escopo {ESCOPO}" if ESCOPO else ""))
            return 0

        novas: dict[int, int] = {}
        alvo: dict[int, Pedido] = {}

        print("Escopo alvo ..........:", ESCOPO or "todos")
        print()

        for escopo in sorted(por_escopo):
            lista = por_escopo[escopo]
            zerados = [p for p in lista if not p.prioridade]
            if not zerados:
                continue

            # A numeração continua a partir do maior número já usado no escalão.
            # Ler de `pedidos.prioridade` (e não do histórico) é o que importa
            # aqui: os pedidos antigos nunca chegaram a gerar histórico.
            ultima = max((p.prioridade or 0) for p in lista)

            print("=== %s ===" % escopo)
            print("  ja priorizados: %d (maior prioridade = %d)"
                  % (len(lista) - len(zerados), ultima))
            print("  a numerar ....: %d  ->  prioridades %d..%d"
                  % (len(zerados), ultima + 1, ultima + len(zerados)))
            print()
            print("  %-8s %-6s %-24s %s" % ("PEDIDO", "NOVA", "OM", "CONSOLIDADO EM"))
            print("  " + "-" * 64)

            ordenados = sorted(
                zerados,
                key=lambda p: (p.encaminhado_em or _SEM_DATA, p.criado_em, p.id),
            )
            for i, p in enumerate(ordenados, start=ultima + 1):
                novas[p.id] = i
                alvo[p.id] = p
                quando = (p.encaminhado_em.strftime("%d/%m/%Y %H:%M")
                          if p.encaminhado_em else "(sem data)")
                print("  %-8s %-6s %-24s %s"
                      % (p.id, i, (oms.get(p.usuario_id) or "")[:24], quando))
            print()

        if not novas:
            print("Nenhum pedido sem prioridade. Nada a fazer.")
            return 0

        conflitos = conflitos_de_prioridade(novas, alvo)
        if conflitos:
            print("CONFLITOS - nada sera gravado:")
            for c in conflitos[:20]:
                print("  -", c)
            return 1

        print("Total a numerar:", len(novas))

        if not APLICAR:
            print()
            print("PREVIA - nada foi gravado.")
            print("Para aplicar:  APLICAR=1%s python scripts/%s"
                  % (f" ESCOPO={ESCOPO}" if ESCOPO else "", os.path.basename(__file__)))
            return 0

        escopos = await gravar_prioridades(db, novas, alvo, autor_id=None)
        await db.commit()
        print()
        print("APLICADO: %d pedidos numerados em %s"
              % (len(novas), ", ".join(sorted(escopos))))
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
