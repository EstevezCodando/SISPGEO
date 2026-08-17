"""Reencaminha pedidos cadastrados por engano como DSG para o fluxo COTER.

Caso tratado:
  - usuarios foram corrigidos para orgao_vinculante=COTER;
  - os pedidos criados antes da correcao ficaram em orgao_vinculante=DSG;
  - por isso, aparecem para o Consolidador DSG em vez do Supervisor COTER/RM.

Modo padrao = PREVIA (nao altera nada). Para aplicar de fato:
    APLICAR=1 python scripts/reencaminhar_dsg_coter_supervisor.py

Por seguranca, o script altera somente pedidos em AGUARDANDO_CONSOLIDADOR.
Se algum pedido ja tiver avancado para outro status, ele sera pulado.
"""

import asyncio
import os
import sys
import unicodedata
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.enums import OrgaoVinculanteEnum, StatusPedidoEnum
from app.models.pedido import Pedido
from app.models.user import Usuario
from app.services.historico_service import registrar_historico
from app.services.notification_service import NotificationService
from app.services.pedido_service import RM_TO_SUPERVISOR


APLICAR = os.environ.get("APLICAR") == "1"

ALVOS: dict[int, str] = {
    1147: "ONALDO ROGERIO DE CARVALHO BERTI",
    1148: "ONALDO ROGERIO DE CARVALHO BERTI",
    1149: "ONALDO ROGERIO DE CARVALHO BERTI",
    1021: "ABILIO BARRETO DOS SANTOS NETO",
}


def _norm(value: str | None) -> str:
    if not value:
        return ""
    sem_acento = unicodedata.normalize("NFKD", value)
    sem_acento = "".join(ch for ch in sem_acento if not unicodedata.combining(ch))
    return " ".join(sem_acento.upper().split())


def _enum_value(value) -> str | None:
    return value.value if hasattr(value, "value") else value


async def main() -> None:
    modo = "APLICAR" if APLICAR else "PREVIA"
    print(f"[{modo}] Reencaminhamento DSG -> COTER/Supervisor")
    print(f"Alvos: {', '.join(str(pid) for pid in ALVOS)}\n")

    async with AsyncSessionLocal() as db:
        svc = NotificationService(db)
        movidos = 0
        pulados = 0
        avisos = 0

        for pedido_id, nome_esperado in ALVOS.items():
            pedido = await db.get(Pedido, pedido_id)
            if not pedido:
                print(f"[PULAR] pedido #{pedido_id}: nao encontrado")
                pulados += 1
                continue

            usuario = await db.get(Usuario, pedido.criador_id or pedido.usuario_id)
            if not usuario:
                print(f"[PULAR] pedido #{pedido_id}: solicitante nao encontrado")
                pulados += 1
                continue

            if _norm(nome_esperado) not in _norm(usuario.nome):
                print(
                    f"[PULAR] pedido #{pedido_id}: solicitante divergente "
                    f"(banco='{usuario.nome}', esperado~='{nome_esperado}')"
                )
                pulados += 1
                continue

            user_org = _enum_value(usuario.orgao_vinculante)
            pedido_org = _enum_value(pedido.orgao_vinculante)
            status = _enum_value(pedido.status)
            rm = usuario.regiao_militar or pedido.regiao_militar
            supervisor_perfil = RM_TO_SUPERVISOR.get(rm or "")

            if user_org != "COTER":
                print(
                    f"[PULAR] pedido #{pedido_id}: usuario ainda nao esta em COTER "
                    f"(orgao_usuario={user_org})"
                )
                pulados += 1
                continue

            if status != StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR.value:
                print(
                    f"[PULAR] pedido #{pedido_id}: status atual={status}; "
                    "esperado=AGUARDANDO_CONSOLIDADOR"
                )
                pulados += 1
                continue

            if not supervisor_perfil:
                print(f"[PULAR] pedido #{pedido_id}: RM ausente ou sem mapeamento (RM={rm})")
                pulados += 1
                continue

            supervisores = list(await db.scalars(
                select(Usuario).where(
                    Usuario.perfil == supervisor_perfil,
                    Usuario.ativo == True,
                )
            ))
            if not supervisores:
                print(
                    f"[PULAR] pedido #{pedido_id}: nenhum supervisor ativo para "
                    f"{supervisor_perfil.value}"
                )
                pulados += 1
                continue

            print(
                f"[OK] pedido #{pedido_id}: {usuario.nome} | "
                f"{pedido_org}/{pedido.regiao_militar} -> COTER/{rm} | "
                f"{status} -> AGUARDANDO_SUPERVISOR | "
                f"notificar={supervisor_perfil.value} ({len(supervisores)})"
            )

            if not APLICAR:
                continue

            status_anterior = pedido.status
            pedido.orgao_vinculante = OrgaoVinculanteEnum.COTER
            pedido.regiao_militar = rm
            pedido.diretoria = None
            pedido.status = StatusPedidoEnum.AGUARDANDO_SUPERVISOR
            pedido.gestor_demandante_id = None
            pedido.gestor_dsg_id = None
            pedido.cgeo_id = None

            await registrar_historico(
                db,
                pedido=pedido,
                usuario=None,
                acao="reencaminhar_coter_supervisor",
                status_anterior=status_anterior,
                motivo=(
                    "Ajuste administrativo: pedido cadastrado como DSG por erro "
                    "de vinculo do solicitante; reencaminhado ao Supervisor COTER/RM."
                ),
            )

            count = await svc.notify_by_perfil(
                perfil=supervisor_perfil,
                titulo=f"Pedido #{pedido.id} reencaminhado ao Supervisor",
                mensagem=(
                    f"Pedido de {usuario.nome} foi reencaminhado ao fluxo COTER "
                    f"da RM {rm} apos ajuste administrativo."
                ),
                pedido_id=pedido.id,
            )
            movidos += 1
            avisos += count

        if APLICAR:
            await db.commit()
            print(f"\nAPLICADO: {movidos} pedido(s) movido(s), {avisos} notificacao(oes) criada(s).")
            print(f"PULADOS: {pulados} pedido(s).")
        else:
            print("\nPREVIA concluida: nada foi alterado.")
            print("Para aplicar: APLICAR=1 python scripts/reencaminhar_dsg_coter_supervisor.py")


if __name__ == "__main__":
    asyncio.run(main())
