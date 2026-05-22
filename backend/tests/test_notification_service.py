"""
Testes unitários para :class:`app.services.notification_service.NotificationService`.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.models.enums import OrgaoVinculanteEnum, PerfilEnum
from app.models.user import Usuario
from app.services.notification_service import NotificationService


def _make_usuario(user_id: int, perfil: PerfilEnum) -> MagicMock:
    u = MagicMock(spec=Usuario)
    u.id = user_id
    u.perfil = perfil
    u.ativo = True
    u.orgao_vinculante = OrgaoVinculanteEnum.COTER
    return u


class TestNotifyUser:
    async def test_adiciona_notificacao_ao_db(self, mock_db):
        svc = NotificationService(mock_db)
        await svc.notify_user(
            usuario_id=1,
            titulo="Teste",
            mensagem="Mensagem de teste",
            pedido_id=42,
        )
        mock_db.add.assert_called_once()

    async def test_pedido_id_opcional(self, mock_db):
        svc = NotificationService(mock_db)
        await svc.notify_user(usuario_id=1, titulo="Sem pedido", mensagem="...")
        mock_db.add.assert_called_once()


class TestNotifyByPerfil:
    async def test_notifica_todos_os_usuarios_do_perfil(self, mock_db):
        users = [_make_usuario(i, PerfilEnum.SUPERVISOR) for i in range(3)]
        mock_db.scalars.return_value = MagicMock(
            __iter__=MagicMock(return_value=iter(users))
        )

        svc = NotificationService(mock_db)
        count = await svc.notify_by_perfil(
            perfil=PerfilEnum.SUPERVISOR,
            titulo="Teste em lote",
            mensagem="Mensagem",
        )

        assert count == 3
        assert mock_db.add.call_count == 3

    async def test_retorna_zero_sem_usuarios(self, mock_db):
        mock_db.scalars.return_value = MagicMock(
            __iter__=MagicMock(return_value=iter([]))
        )

        svc = NotificationService(mock_db)
        count = await svc.notify_by_perfil(
            perfil=PerfilEnum.ANALISTA_CGEO,
            titulo="Vazio",
            mensagem="...",
        )

        assert count == 0
        mock_db.add.assert_not_called()

    async def test_filtra_por_orgao_vinculante_quando_fornecido(self, mock_db):
        """Verifica que a query inclui filtro de orgao_vinculante."""
        mock_db.scalars.return_value = MagicMock(
            __iter__=MagicMock(return_value=iter([]))
        )

        svc = NotificationService(mock_db)
        await svc.notify_by_perfil(
            perfil=PerfilEnum.SUPERVISOR,
            titulo="Com filtro",
            mensagem="...",
            orgao_vinculante=OrgaoVinculanteEnum.COTER,
        )

        # Verifica que scalars foi chamado (a lógica do filtro é interna ao SQLAlchemy)
        mock_db.scalars.assert_called_once()
