"""
Serviço de notificações internas do SISGEO.

Concentra toda a lógica de criação de :class:`~app.models.notificacao.Notificacao`
e disparo de e-mails relacionados a eventos de pedido, obedecendo ao
Princípio da Responsabilidade Única (SRP).

Uso típico::

    from app.services.notification_service import NotificationService

    svc = NotificationService(db)
    await svc.notify_user(user_id=42, titulo="Pedido aprovado", mensagem="...", pedido_id=7)
    await svc.notify_by_perfil(perfil=PerfilEnum.GESTOR_CARTOGRAFICO, titulo="...", mensagem="...")
"""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.notificacao import Notificacao
from app.models.user import Usuario
from app.models.enums import PerfilEnum, OrgaoVinculanteEnum

logger = logging.getLogger(__name__)


class NotificationService:
    """Responsável por criar notificações internas (in-app) para usuários.

    Separado do :mod:`~app.services.pedido_service` para respeitar o SRP:
    a lógica de *onde* notificar fica aqui; a lógica de *quando* fica no
    serviço de pedidos.
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def notify_user(
        self,
        usuario_id: int,
        titulo: str,
        mensagem: str,
        pedido_id: int | None = None,
    ) -> None:
        """Cria uma notificação para um usuário específico.

        Args:
            usuario_id: ID do destinatário.
            titulo:     Título curto exibido no sininho.
            mensagem:   Texto completo da notificação.
            pedido_id:  Pedido relacionado, se houver (para deep-link).
        """
        self._db.add(Notificacao(
            usuario_id=usuario_id,
            titulo=titulo,
            mensagem=mensagem,
            pedido_id=pedido_id,
        ))
        logger.debug(
            "Notificação enfileirada → usuário=%d  título=%r  pedido=%s",
            usuario_id, titulo, pedido_id,
        )

    async def notify_by_perfil(
        self,
        perfil: PerfilEnum | frozenset[PerfilEnum],
        titulo: str,
        mensagem: str,
        pedido_id: int | None = None,
        orgao_vinculante: OrgaoVinculanteEnum | None = None,
        regiao_militar: str | None = None,
    ) -> int:
        """Cria notificações para todos os usuários ativos de um perfil (ou conjunto).

        Args:
            perfil:            Perfil alvo ou frozenset de perfis.
            titulo:            Título da notificação.
            mensagem:          Texto completo.
            pedido_id:         Pedido relacionado, se houver.
            orgao_vinculante:  Filtra por órgão vinculante quando fornecido.
            regiao_militar:    Filtra por Região Militar quando fornecido.

        Returns:
            Número de notificações criadas.
        """
        from sqlalchemy import or_

        if isinstance(perfil, frozenset):
            query = select(Usuario).where(
                or_(*[Usuario.perfil == p for p in perfil]),
                Usuario.ativo == True,
            )
            perfil_label = f"{{{','.join(p.value for p in perfil)}}}"
        else:
            query = select(Usuario).where(
                Usuario.perfil == perfil,
                Usuario.ativo == True,
            )
            perfil_label = perfil.value

        if orgao_vinculante is not None:
            query = query.where(Usuario.orgao_vinculante == orgao_vinculante)
        if regiao_militar is not None:
            query = query.where(Usuario.regiao_militar == regiao_militar)

        usuarios = list(await self._db.scalars(query))

        for u in usuarios:
            await self.notify_user(u.id, titulo, mensagem, pedido_id)

        logger.debug(
            "notify_by_perfil → perfil=%s  orgao_vinculante=%s  destinatários=%d",
            perfil_label, orgao_vinculante, len(usuarios),
        )
        return len(usuarios)
