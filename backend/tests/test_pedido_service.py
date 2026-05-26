"""
Testes unitários para :mod:`app.services.pedido_service`.

Todas as dependências externas (banco, e-mail, notificações) são mockadas.
A ``NotificationService`` é patchada para verificar chamadas sem efeito colateral.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.models.enums import PerfilEnum, StatusPedidoEnum
from app.services import pedido_service


# ---------------------------------------------------------------------------
# submit_pedido
# ---------------------------------------------------------------------------

class TestSubmitPedido:
    async def test_pedido_ja_submetido_levanta_400(self, mock_db, pedido_submetido_brigada, usuario_omds):
        with pytest.raises(HTTPException) as exc:
            await pedido_service.submit_pedido(mock_db, pedido_submetido_brigada, usuario_omds)
        assert exc.value.status_code == 400

    async def test_pedido_de_outro_usuario_levanta_403(self, mock_db, pedido_rascunho, gestor_brigada):
        with pytest.raises(HTTPException) as exc:
            await pedido_service.submit_pedido(mock_db, pedido_rascunho, gestor_brigada)
        assert exc.value.status_code == 403

    async def test_pedido_sem_itens_levanta_400(self, mock_db, pedido_rascunho, usuario_omds):
        pedido_rascunho.itens = []
        with pytest.raises(HTTPException) as exc:
            await pedido_service.submit_pedido(mock_db, pedido_rascunho, usuario_omds)
        assert exc.value.status_code == 400

    async def test_perfil_nao_autorizado_levanta_403(self, mock_db, pedido_rascunho, gestor_dsg):
        # GESTOR_CARTOGRAFICO não está no _SUBMIT_ROUTING
        pedido_rascunho.usuario_id = gestor_dsg.id
        with pytest.raises(HTTPException) as exc:
            await pedido_service.submit_pedido(mock_db, pedido_rascunho, gestor_dsg)
        assert exc.value.status_code == 403

    async def test_submit_bem_sucedido_avanca_status(self, mock_db, pedido_rascunho, usuario_omds):
        mock_db.get.return_value = None  # sem operação
        mock_db.scalars.return_value = MagicMock(__iter__=MagicMock(return_value=iter([])))

        with (
            patch("app.services.pedido_service.send_email", new_callable=AsyncMock),
            patch("app.services.pedido_service.pedido_submetido", return_value=("subj", "<html/>")),
            patch("app.services.pedido_service.notificar_gestor", return_value=("subj", "<html/>")),
            patch("app.services.pedido_service.NotificationService") as mock_svc_cls,
        ):
            mock_svc = AsyncMock()
            mock_svc.notify_by_perfil = AsyncMock(return_value=0)
            mock_svc_cls.return_value = mock_svc

            result = await pedido_service.submit_pedido(mock_db, pedido_rascunho, usuario_omds)

        assert result.status == StatusPedidoEnum.AGUARDANDO_SUPERVISOR
        mock_db.commit.assert_called()


# ---------------------------------------------------------------------------
# review_pedido
# ---------------------------------------------------------------------------

class TestReviewPedido:
    async def test_status_invalido_levanta_400(self, mock_db, pedido_rascunho, gestor_brigada):
        with pytest.raises(HTTPException) as exc:
            await pedido_service.review_pedido(mock_db, pedido_rascunho, gestor_brigada, "aprovar", None)
        assert exc.value.status_code == 400

    async def test_acao_invalida_levanta_400(self, mock_db, pedido_submetido_brigada, gestor_brigada):
        with pytest.raises(HTTPException) as exc:
            await pedido_service.review_pedido(mock_db, pedido_submetido_brigada, gestor_brigada, "inventada", None)
        assert exc.value.status_code == 400

    async def test_aprovar_avanca_para_aguardando_consolidador(self, mock_db, pedido_submetido_brigada, gestor_brigada):
        result = await pedido_service.review_pedido(
            mock_db, pedido_submetido_brigada, gestor_brigada, "aprovar", None
        )
        assert result.status == StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR

    async def test_reprovar_cancela_e_envia_email(self, mock_db, pedido_submetido_brigada, gestor_brigada):
        fake_usuario = MagicMock()
        fake_usuario.nome = "Solicitante"
        fake_usuario.email = "sol@eb.mil.br"
        mock_db.get.return_value = fake_usuario

        with (
            patch("app.services.pedido_service.send_email", new_callable=AsyncMock),
            patch("app.services.pedido_service.pedido_reprovado", return_value=("subj", "<html/>")),
        ):
            result = await pedido_service.review_pedido(
                mock_db, pedido_submetido_brigada, gestor_brigada, "reprovar", "Fora do prazo"
            )

        assert result.status == StatusPedidoEnum.CANCELADO
        assert result.motivo_reprovacao == "Fora do prazo"

    async def test_observacoes_sao_salvas(self, mock_db, pedido_submetido_brigada, gestor_brigada):
        await pedido_service.review_pedido(
            mock_db, pedido_submetido_brigada, gestor_brigada, "aprovar", None,
            observacoes="Verificar escala"
        )
        assert pedido_submetido_brigada.observacoes == "Verificar escala"


# ---------------------------------------------------------------------------
# consolidate_pedidos
# ---------------------------------------------------------------------------

class TestConsolidatePedidos:
    async def test_perfil_nao_autorizado_levanta_403(self, mock_db, gestor_dsg):
        with pytest.raises(HTTPException) as exc:
            await pedido_service.consolidate_pedidos(mock_db, [1, 2], gestor_dsg)
        assert exc.value.status_code == 403

    async def test_consolidacao_avanca_pedidos_validos(
        self, mock_db, pedido_submetido_brigada, gestor_brigada
    ):
        mock_db.get.return_value = pedido_submetido_brigada

        with patch("app.services.pedido_service.NotificationService") as mock_svc_cls:
            mock_svc = AsyncMock()
            mock_svc.notify_by_perfil = AsyncMock(return_value=0)
            mock_svc_cls.return_value = mock_svc

            result = await pedido_service.consolidate_pedidos(mock_db, [1], gestor_brigada)

        assert result == {"submetidos": 1}
        assert pedido_submetido_brigada.status == StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR

    async def test_pedido_com_status_errado_e_ignorado(self, mock_db, pedido_rascunho, gestor_brigada):
        mock_db.get.return_value = pedido_rascunho  # status RASCUNHO, não AGUARDANDO_SUPERVISOR

        with patch("app.services.pedido_service.NotificationService") as mock_svc_cls:
            mock_svc = AsyncMock()
            mock_svc.notify_by_perfil = AsyncMock(return_value=0)
            mock_svc_cls.return_value = mock_svc

            result = await pedido_service.consolidate_pedidos(mock_db, [1], gestor_brigada)

        assert result == {"submetidos": 0}


# ---------------------------------------------------------------------------
# assign_cgeo
# ---------------------------------------------------------------------------

class TestAssignCgeo:
    async def test_status_invalido_levanta_400(self, mock_db, pedido_rascunho, gestor_dsg):
        with pytest.raises(HTTPException) as exc:
            await pedido_service.assign_cgeo(mock_db, pedido_rascunho, cgeo_id=1, dsg=gestor_dsg)
        assert exc.value.status_code == 400

    async def test_atribuicao_bem_sucedida(self, mock_db, pedido_submetido_dsg, gestor_dsg):
        with patch("app.services.pedido_service.NotificationService") as mock_svc_cls:
            mock_svc = AsyncMock()
            mock_svc.notify_by_perfil = AsyncMock(return_value=1)
            mock_svc_cls.return_value = mock_svc

            result = await pedido_service.assign_cgeo(mock_db, pedido_submetido_dsg, cgeo_id=3, dsg=gestor_dsg)

        assert result.status == StatusPedidoEnum.ATRIBUIDO_CGEO
        assert result.cgeo_id == 3
        assert result.gestor_dsg_id == gestor_dsg.id


# ---------------------------------------------------------------------------
# cgeo_review
# ---------------------------------------------------------------------------

class TestCgeoReview:
    async def test_status_invalido_levanta_400(self, mock_db, pedido_rascunho, gestor_cgeo):
        with pytest.raises(HTTPException) as exc:
            await pedido_service.cgeo_review(mock_db, pedido_rascunho, gestor_cgeo, "aprovar", None)
        assert exc.value.status_code == 400

    async def test_acao_invalida_levanta_400(self, mock_db, pedido_atribuido_cgeo, gestor_cgeo):
        mock_db.get.return_value = MagicMock()
        with pytest.raises(HTTPException) as exc:
            await pedido_service.cgeo_review(mock_db, pedido_atribuido_cgeo, gestor_cgeo, "inventada", None)
        assert exc.value.status_code == 400

    async def test_aprovacao_envia_email_ao_solicitante(self, mock_db, pedido_atribuido_cgeo, gestor_cgeo):
        fake_usuario = MagicMock()
        fake_usuario.nome = "Solicitante"
        fake_usuario.email = "sol@eb.mil.br"
        mock_db.get.return_value = fake_usuario

        with (
            patch("app.services.pedido_service.send_email", new_callable=AsyncMock),
            patch("app.services.pedido_service.pedido_aprovado", return_value=("subj", "<html/>")),
            patch("app.services.pedido_service.NotificationService") as mock_svc_cls,
        ):
            mock_svc = AsyncMock()
            mock_svc.notify_by_perfil = AsyncMock(return_value=1)
            mock_svc_cls.return_value = mock_svc

            result = await pedido_service.cgeo_review(
                mock_db, pedido_atribuido_cgeo, gestor_cgeo, "aprovar", None
            )

        assert result.status == StatusPedidoEnum.APROVADO

    async def test_reprovacao_registra_motivo(self, mock_db, pedido_atribuido_cgeo, gestor_cgeo):
        fake_usuario = MagicMock()
        fake_usuario.nome = "Solicitante"
        fake_usuario.email = "sol@eb.mil.br"
        mock_db.get.return_value = fake_usuario

        with (
            patch("app.services.pedido_service.send_email", new_callable=AsyncMock),
            patch("app.services.pedido_service.pedido_reprovado", return_value=("subj", "<html/>")),
            patch("app.services.pedido_service.NotificationService") as mock_svc_cls,
        ):
            mock_svc = AsyncMock()
            mock_svc.notify_by_perfil = AsyncMock(return_value=1)
            mock_svc_cls.return_value = mock_svc

            result = await pedido_service.cgeo_review(
                mock_db, pedido_atribuido_cgeo, gestor_cgeo, "reprovar", "Área não coberta"
            )

        assert result.status == StatusPedidoEnum.REPROVADO
        assert result.motivo_reprovacao == "Área não coberta"
