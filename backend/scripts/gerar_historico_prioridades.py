"""Gera o histórico de prioridade dos pedidos que já têm número mas não registro.

Os pedidos encaminhados antes da criação de ``prioridades_encaminhamento``
guardam a prioridade na coluna ``pedidos.prioridade``, mas não têm o registro
que diz **qual escalão** a atribuiu. Sem ele a interface não consegue montar a
cadeia ("Consolidador DEC: Prioridade 1") — só o número solto.

Este comando preenche essa lacuna deduzindo o escalão pelo estado do pedido,
com a mesma regra que o resto do sistema usa (``escopo_remetente``): quem
aguarda o supervisor veio do solicitante, quem aguarda o consolidador veio do
supervisor da RM ou da Diretoria, e da DSG em diante veio do consolidador do
órgão — DEC, DECEx, COTER, COLOG ou DSG.

**É uma reconstrução, não um carimbo real.** O registro fica com
``definida_por_id`` nulo, porque não há como saber quem executou a ação, e com
``definida_em`` igual a ``encaminhado_em``, que é a data em que o órgão de fato
consolidou o envio. Pedidos que já possuem histórico não são tocados.

Modo padrão = PRÉVIA (não altera nada). Para aplicar de fato:

    APLICAR=1 python scripts/gerar_historico_prioridades.py

Para restringir a um escalão:

    ESCOPO=CONSOLIDADOR_DECEX python scripts/gerar_historico_prioridades.py
"""

import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.audit_log import AuditLog
from app.models.pedido import Pedido
from app.models.prioridade import PrioridadeEncaminhamento
from app.routers.prioridades import (
    STATUS_SUBMETIDOS,
    _rotulo_escalao,
    escopo_remetente,
)
from app.services.prioridade_service import ciclo_atual

APLICAR = os.environ.get("APLICAR") == "1"
ESCOPO = os.environ.get("ESCOPO") or None


async def main() -> int:
    async with AsyncSessionLocal() as db:
        ciclo = await ciclo_atual(db)

        pedidos = [
            p for p in await db.scalars(
                select(Pedido).where(Pedido.status.in_(STATUS_SUBMETIDOS))
            )
            if p.prioridade and p.prioridade > 0
        ]

        # Já existentes: (pedido_id, escopo) que não devem ser duplicados, e
        # (escopo, prioridade) que a UNIQUE do banco impede de repetir.
        existentes = list(await db.scalars(
            select(PrioridadeEncaminhamento).where(
                PrioridadeEncaminhamento.ciclo == ciclo
            )
        ))
        ja_tem = {(r.pedido_id, r.escopo) for r in existentes}
        numero_ocupado = {(r.escopo, r.prioridade): r.pedido_id for r in existentes}

        print("Ciclo ................:", ciclo)
        print("Escopo alvo ..........:", ESCOPO or "todos")
        print("Pedidos com prioridade:", len(pedidos))
        print("Ja com historico .....:", len(existentes))
        print()

        candidatos: list[tuple[Pedido, str]] = []
        conflitos: list[str] = []
        por_escopo: dict[str, int] = {}

        for p in sorted(pedidos, key=lambda x: (x.prioridade, x.id)):
            escopo = escopo_remetente(p)
            if ESCOPO and escopo != ESCOPO:
                continue
            if (p.id, escopo) in ja_tem:
                continue

            chave = (escopo, p.prioridade)
            if chave in numero_ocupado:
                conflitos.append(
                    "Prioridade %d ja usada em %s pelo pedido %d — pedido %d nao pode receber a mesma"
                    % (p.prioridade, escopo, numero_ocupado[chave], p.id)
                )
                continue

            numero_ocupado[chave] = p.id
            candidatos.append((p, escopo))
            por_escopo[escopo] = por_escopo.get(escopo, 0) + 1

        if conflitos:
            print("CONFLITOS - prioridades repetidas dentro do mesmo escalao.")
            print("Nada sera gravado. Resolva a duplicidade antes (ver planilha do orgao):")
            for c in conflitos[:20]:
                print("  -", c)
            if len(conflitos) > 20:
                print("  ... e mais %d" % (len(conflitos) - 20))
            return 1

        if not candidatos:
            print("Nenhum pedido pendente de historico. Nada a fazer.")
            return 0

        for escopo in sorted(por_escopo):
            faixa = sorted(p.prioridade for p, e in candidatos if e == escopo)
            print("  %-24s %3d pedidos   prioridades %d..%d"
                  % (escopo, por_escopo[escopo], faixa[0], faixa[-1]))

        print()
        print("Total a gerar:", len(candidatos))

        if not APLICAR:
            print()
            print("PREVIA - nada foi gravado.")
            print("Para aplicar:  APLICAR=1%s python scripts/%s"
                  % (f" ESCOPO={ESCOPO}" if ESCOPO else "", os.path.basename(__file__)))
            return 0

        agora = datetime.now(timezone.utc)
        for p, escopo in candidatos:
            db.add(PrioridadeEncaminhamento(
                pedido_id=p.id,
                escopo=escopo,
                escalao=_rotulo_escalao(escopo),
                ciclo=ciclo,
                prioridade=p.prioridade,
                # Nulo de proposito: nao ha como saber quem carimbou.
                definida_por_id=None,
                # A data em que o orgao consolidou o envio e o melhor registro
                # disponivel do momento da decisao.
                definida_em=p.encaminhado_em or agora,
            ))

        db.add(AuditLog(
            usuario_id=None,
            acao="gerar_historico_prioridades",
            entidade="pedido",
            entidade_id=min(p.id for p, _ in candidatos),
            dados_extras={
                "ciclo": ciclo,
                "escopos": por_escopo,
                "total": len(candidatos),
                "observacao": "historico reconstruido a partir de pedidos.prioridade",
            },
        ))

        await db.commit()
        print()
        print("APLICADO: %d registros de historico gerados em %s"
              % (len(candidatos), ", ".join(sorted(por_escopo))))
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
