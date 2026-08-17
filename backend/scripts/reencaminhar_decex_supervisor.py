"""Reencaminha pedidos DECEx do fluxo antigo (parados no Consolidador) ao
Supervisor da Diretoria correspondente.

Alvo (seguro): orgao_vinculante=DECEx, status=AGUARDANDO_CONSOLIDADOR e
diretoria IS NULL — ou seja, apenas os pedidos criados ANTES da atualização, que
nunca passaram por um supervisor. Pedidos que já passaram por supervisor têm a
Diretoria preenchida e NÃO são tocados.

Modo padrão = PRÉVIA (não altera nada). Para aplicar de fato:
    APLICAR=1 python reencaminhar_decex_supervisor.py
"""
import os
import sys
import asyncio

# Garante que a raiz do backend (/app) esteja no sys.path, permitindo
# `python scripts/reencaminhar_decex_supervisor.py` de qualquer diretório.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.pedido import Pedido
from app.models.user import Usuario
from app.models.enums import StatusPedidoEnum, OrgaoVinculanteEnum
from app.utils.diretorias_decex import diretoria_de_om
from app.services.historico_service import registrar_historico

APLICAR = os.environ.get("APLICAR") == "1"


async def main():
    async with AsyncSessionLocal() as db:
        pedidos = list(await db.scalars(
            select(Pedido).where(
                Pedido.orgao_vinculante == OrgaoVinculanteEnum.DECEx,
                Pedido.status == StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR,
                Pedido.diretoria.is_(None),
            ).order_by(Pedido.id)
        ))
        modo = "APLICAR" if APLICAR else "PRÉVIA"
        print(f"[{modo}] {len(pedidos)} pedido(s) DECEx no Consolidador (fluxo antigo, diretoria nula).\n")

        movidos = 0
        sem_map = []
        for p in pedidos:
            u = await db.get(Usuario, p.criador_id or p.usuario_id)
            om = u.om if u else "?"
            dire = diretoria_de_om(om) if u else None
            if not dire:
                sem_map.append((p.id, om))
                print(f"  [SEM MAPA] #{p.id}  OM={om}  -> pulado")
                continue
            print(f"  #{p.id}  OM={om:24} -> Supervisor {dire}")
            if APLICAR:
                ant = p.status
                p.status = StatusPedidoEnum.AGUARDANDO_SUPERVISOR
                p.diretoria = dire
                await registrar_historico(
                    db, p, None, "reencaminhar_supervisor", ant,
                    "Reencaminhado ao Supervisor da Diretoria (ajuste de fluxo DECEx)",
                )
                movidos += 1

        if APLICAR:
            await db.commit()
            print(f"\n✓ APLICADO: {movidos} pedido(s) -> AGUARDANDO_SUPERVISOR.")
        else:
            print(f"\n[PRÉVIA] Nada alterado. Para aplicar: APLICAR=1 python reencaminhar_decex_supervisor.py")

        if sem_map:
            print("\n⚠ OMs sem mapeamento (não movidos, verificar):")
            for pid, om in sem_map:
                print(f"    pedido #{pid}: '{om}'")


if __name__ == "__main__":
    asyncio.run(main())
