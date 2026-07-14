"""Autoenvio de pedidos em rascunho apos o fim das janelas de solicitante."""

import asyncio
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.enums import PerfilEnum, StatusPedidoEnum, TipoJanelaEnum
from app.models.janela import JanelaPedidos
from app.models.pedido import Pedido
from app.models.user import Usuario
from app.services import pedido_service
from app.utils.logging_config import get_logger

logger = get_logger(__name__)


async def solicitante_sem_janela_aberta_ou_futura(db: AsyncSession) -> bool:
    """Retorna True quando a etapa de solicitante ja terminou no ciclo atual."""
    now = datetime.now(timezone.utc)

    existe_janela = await db.scalar(
        select(JanelaPedidos.id)
        .where(JanelaPedidos.tipo_janela == TipoJanelaEnum.SOLICITANTE)
        .limit(1)
    )
    if not existe_janela:
        return False

    janela_aberta_ou_futura = await db.scalar(
        select(JanelaPedidos.id)
        .where(
            JanelaPedidos.tipo_janela == TipoJanelaEnum.SOLICITANTE,
            JanelaPedidos.data_fim >= now,
        )
        .limit(1)
    )
    return janela_aberta_ou_futura is None


async def auto_submit_rascunhos_solicitantes(
    db: AsyncSession,
    *,
    dry_run: bool = False,
    ignore_window: bool = False,
    limit: int | None = None,
) -> dict[str, Any]:
    """Submete todos os pedidos RASCUNHO de solicitantes usando a regra normal.

    A funcao nao altera status diretamente: reaproveita ``submit_pedido`` para
    respeitar o roteamento por orgao/RM/Diretoria, registrar historico e notificar
    o proximo escalao.
    """
    if not ignore_window and not await solicitante_sem_janela_aberta_ou_futura(db):
        return {
            "executado": False,
            "motivo": "Ainda existe janela de solicitante aberta ou futura",
            "encontrados": 0,
            "submetidos": 0,
            "falhas": [],
        }

    stmt = (
        select(Pedido)
        .join(Usuario, Pedido.usuario_id == Usuario.id)
        .where(
            Pedido.status == StatusPedidoEnum.RASCUNHO,
            Usuario.perfil == PerfilEnum.SOLICITANTE,
        )
        .order_by(Pedido.id)
    )
    if limit is not None:
        stmt = stmt.limit(limit)

    pedidos = list(await db.scalars(stmt))
    result: dict[str, Any] = {
        "executado": True,
        "dry_run": dry_run,
        "encontrados": len(pedidos),
        "submetidos": 0,
        "ids": [p.id for p in pedidos],
        "falhas": [],
    }
    if dry_run or not pedidos:
        return result

    for pedido in pedidos:
        usuario = await db.get(Usuario, pedido.usuario_id)
        if not usuario:
            result["falhas"].append({"pedido_id": pedido.id, "erro": "Usuario nao encontrado"})
            continue

        pedido.auto_submitted = True
        try:
            await pedido_service.submit_pedido(db, pedido, usuario)
            result["submetidos"] += 1
        except HTTPException as exc:
            await db.rollback()
            result["falhas"].append({"pedido_id": pedido.id, "erro": str(exc.detail)})
        except Exception as exc:
            await db.rollback()
            logger.exception("Falha no autoenvio do pedido #%s", pedido.id)
            result["falhas"].append({"pedido_id": pedido.id, "erro": str(exc)})

    return result


async def auto_submit_rascunhos_scheduler(interval_seconds: int = 900) -> None:
    """Loop de background: verifica periodicamente rascunhos apos fim da janela."""
    while True:
        try:
            async with AsyncSessionLocal() as db:
                result = await auto_submit_rascunhos_solicitantes(db)
                if result.get("executado") and result.get("encontrados"):
                    logger.info(
                        "Autoenvio de rascunhos: encontrados=%s submetidos=%s falhas=%s",
                        result.get("encontrados"),
                        result.get("submetidos"),
                        len(result.get("falhas", [])),
                    )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Erro no agendador de autoenvio de rascunhos")

        await asyncio.sleep(interval_seconds)
