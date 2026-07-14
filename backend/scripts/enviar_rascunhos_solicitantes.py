"""Envia rascunhos de solicitantes para a proxima etapa.

Modo padrao = PREVIA (nao altera nada):
    python scripts/enviar_rascunhos_solicitantes.py

Aplicar de fato:
    APLICAR=1 python scripts/enviar_rascunhos_solicitantes.py

Por seguranca, respeita a regra de janela: so aplica quando nao existe janela de
solicitante aberta ou futura. Para uma correcao administrativa excepcional:
    APLICAR=1 FORCAR=1 python scripts/enviar_rascunhos_solicitantes.py
"""

import asyncio
import os
import sys

from sqlalchemy import text

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal, engine
from app.services.auto_submit_service import auto_submit_rascunhos_solicitantes

APLICAR = os.environ.get("APLICAR") == "1"
FORCAR = os.environ.get("FORCAR") == "1"


async def garantir_schema():
    """Garante colunas usadas por este script quando rodado fora do startup."""
    statements = [
        "ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS removido BOOLEAN DEFAULT FALSE",
        "UPDATE itens_pedido SET removido = FALSE WHERE removido IS NULL",
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN DEFAULT FALSE",
        "UPDATE pedidos SET auto_submitted = FALSE WHERE auto_submitted IS NULL",
    ]
    async with engine.begin() as conn:
        for statement in statements:
            await conn.execute(text(statement))


async def main():
    await garantir_schema()

    async with AsyncSessionLocal() as db:
        result = await auto_submit_rascunhos_solicitantes(
            db,
            dry_run=not APLICAR,
            ignore_window=FORCAR,
        )

    modo = "APLICAR" if APLICAR else "PREVIA"
    print(f"[{modo}] Autoenvio de rascunhos de solicitantes")
    if FORCAR:
        print("FORCAR=1 ativo: regra de janela ignorada.")
    if not result.get("executado"):
        print(f"Nada executado: {result.get('motivo')}")
        return

    print(f"Encontrados: {result.get('encontrados', 0)}")
    print(f"Submetidos : {result.get('submetidos', 0)}")
    ids = result.get("ids") or []
    if ids:
        print("Pedidos   : " + ", ".join(str(i) for i in ids))
    falhas = result.get("falhas") or []
    if falhas:
        print("\nFalhas:")
        for falha in falhas:
            print(f"  #{falha.get('pedido_id')}: {falha.get('erro')}")


if __name__ == "__main__":
    asyncio.run(main())
