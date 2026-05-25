"""
Testes unitários para :mod:`app.services.auth_service`.

Todas as dependências externas (banco, e-mail) são mockadas.
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.models.enums import PerfilEnum
from app.models.user import Usuario, TokenSenha
from app.services import auth_service


# ---------------------------------------------------------------------------
# register_user
# ---------------------------------------------------------------------------

class TestRegisterUser:
    async def test_email_duplicado_levanta_400(self, mock_db):
        """Deve lançar 400 quando o e-mail já está cadastrado."""
        mock_db.scalar.return_value = MagicMock()  # usuário existente

        with pytest.raises(HTTPException) as exc:
            await auth_service.register_user(
                mock_db, "João", "joao@eb.mil.br", "(61)99999-0000",
                "1ª Brigada", "S3", "Senha@123",
            )
        assert exc.value.status_code == 400

    async def test_cadastro_bem_sucedido(self, mock_db):
        """Deve criar usuário, token, chamar commit e enviar e-mail."""
        mock_db.scalar.return_value = None  # e-mail livre

        with (
            patch("app.services.auth_service.get_password_hash", return_value="hash"),
            patch("app.services.auth_service.generate_token", return_value="tok123"),
            patch("app.services.auth_service.send_email", new_callable=AsyncMock) as mock_email,
            patch("app.services.auth_service.ativacao_conta", return_value=("Assunto", "<html/>")),
        ):
            await auth_service.register_user(
                mock_db, "João", "joao@eb.mil.br", "(61)99999-0000",
                "1ª Brigada", "S3", "Senha@123",
            )

        # db.add chamado ao menos duas vezes: usuário + token de ativação
        assert mock_db.add.call_count >= 2
        mock_db.commit.assert_called()
        mock_email.assert_called_once()


# ---------------------------------------------------------------------------
# confirm_email
# ---------------------------------------------------------------------------

class TestConfirmEmail:
    async def test_token_invalido_levanta_400(self, mock_db):
        """Token inexistente ou expirado deve lançar 400."""
        mock_db.scalar.return_value = None

        with pytest.raises(HTTPException) as exc:
            await auth_service.confirm_email(mock_db, "token-invalido")
        assert exc.value.status_code == 400

    async def test_confirmacao_bem_sucedida(self, mock_db):
        """Token válido deve ativar o usuário."""
        fake_token = MagicMock(spec=TokenSenha)
        fake_token.usuario_id = 1
        fake_token.usado = False

        fake_user = MagicMock(spec=Usuario)
        fake_user.id = 1
        fake_user.nome = "João"
        fake_user.ativo = False
        fake_user.email_confirmado = False

        mock_db.scalar.return_value = fake_token
        mock_db.get.return_value = fake_user

        result = await auth_service.confirm_email(mock_db, "token-valido")

        assert fake_user.ativo is True
        assert fake_user.email_confirmado is True
        assert fake_token.usado is True
        mock_db.commit.assert_called()


# ---------------------------------------------------------------------------
# authenticate_user
# ---------------------------------------------------------------------------

class TestAuthenticateUser:
    async def test_email_nao_encontrado_levanta_401(self, mock_db):
        mock_db.scalar.return_value = None

        with pytest.raises(HTTPException) as exc:
            await auth_service.authenticate_user(mock_db, "nao@eb.mil.br", "senha", "127.0.0.1")
        assert exc.value.status_code == 401

    async def test_conta_bloqueada_levanta_403(self, mock_db):
        fake_user = MagicMock(spec=Usuario)
        fake_user.bloqueado_ate = datetime.now(timezone.utc) + timedelta(minutes=10)
        fake_user.bloqueado_ate = fake_user.bloqueado_ate.replace(tzinfo=None)  # naive, como no banco
        mock_db.scalar.return_value = fake_user

        with pytest.raises(HTTPException) as exc:
            await auth_service.authenticate_user(mock_db, "user@eb.mil.br", "senha", "127.0.0.1")
        assert exc.value.status_code == 403

    async def test_senha_incorreta_levanta_401(self, mock_db):
        fake_user = MagicMock(spec=Usuario)
        fake_user.bloqueado_ate = None
        fake_user.tentativas_login = 0
        fake_user.senha_hash = "hash"
        mock_db.scalar.return_value = fake_user

        with patch("app.services.auth_service.verify_password", return_value=False):
            with pytest.raises(HTTPException) as exc:
                await auth_service.authenticate_user(mock_db, "user@eb.mil.br", "errada", "127.0.0.1")
        assert exc.value.status_code == 401
        assert fake_user.tentativas_login == 1

    async def test_login_bem_sucedido_retorna_token(self, mock_db):
        fake_user = MagicMock(spec=Usuario)
        fake_user.bloqueado_ate = None
        fake_user.tentativas_login = 0
        fake_user.ativo = True
        fake_user.email_confirmado = True
        fake_user.senha_hash = "hash"
        fake_user.id = 1
        fake_user.email = "user@eb.mil.br"
        fake_user.perfil = MagicMock(value="SOLICITANTE")
        fake_user.ultima_senha_alterada = datetime.now(timezone.utc)
        mock_db.scalar.return_value = fake_user

        with (
            patch("app.services.auth_service.verify_password", return_value=True),
            patch("app.services.auth_service.create_access_token", return_value="jwt.token.here"),
        ):
            token = await auth_service.authenticate_user(
                mock_db, "user@eb.mil.br", "correta", "127.0.0.1"
            )

        assert token == "jwt.token.here"
        assert fake_user.tentativas_login == 0

    async def test_senha_expirada_levanta_403(self, mock_db):
        fake_user = MagicMock(spec=Usuario)
        fake_user.bloqueado_ate = None
        fake_user.tentativas_login = 0
        fake_user.ativo = True
        fake_user.email_confirmado = True
        fake_user.senha_hash = "hash"
        fake_user.ultima_senha_alterada = datetime.now(timezone.utc) - timedelta(days=400)
        mock_db.scalar.return_value = fake_user

        with patch("app.services.auth_service.verify_password", return_value=True):
            with pytest.raises(HTTPException) as exc:
                await auth_service.authenticate_user(
                    mock_db, "user@eb.mil.br", "correta", "127.0.0.1"
                )
        assert exc.value.status_code == 403
        assert "expirada" in exc.value.detail.lower()


# ---------------------------------------------------------------------------
# request_password_reset
# ---------------------------------------------------------------------------

class TestRequestPasswordReset:
    async def test_email_desconhecido_silencioso(self, mock_db):
        """Não deve lançar exceção para e-mail desconhecido."""
        mock_db.scalar.return_value = None
        # Não deve lançar nada
        await auth_service.request_password_reset(mock_db, "nao@eb.mil.br", "127.0.0.1")

    async def test_limite_diario_levanta_429(self, mock_db):
        fake_user = MagicMock(spec=Usuario)
        fake_user.id = 1

        # Primeira chamada → usuário; segunda → count de tokens
        mock_db.scalar.side_effect = [fake_user, auth_service.MAX_RESET_TOKENS_PER_DAY]

        with pytest.raises(HTTPException) as exc:
            await auth_service.request_password_reset(mock_db, "user@eb.mil.br", "127.0.0.1")
        assert exc.value.status_code == 429


# ---------------------------------------------------------------------------
# reset_password
# ---------------------------------------------------------------------------

class TestResetPassword:
    async def test_token_invalido_levanta_400(self, mock_db):
        mock_db.scalar.return_value = None

        with pytest.raises(HTTPException) as exc:
            await auth_service.reset_password(mock_db, "token-invalido", "NovaSenha@1")
        assert exc.value.status_code == 400

    async def test_redefinicao_bem_sucedida(self, mock_db):
        fake_token = MagicMock(spec=TokenSenha)
        fake_token.usuario_id = 1
        fake_token.usado = False

        fake_user = MagicMock(spec=Usuario)
        fake_user.id = 1

        mock_db.scalar.return_value = fake_token
        mock_db.get.return_value = fake_user

        with patch("app.services.auth_service.get_password_hash", return_value="novo_hash"):
            await auth_service.reset_password(mock_db, "token-valido", "NovaSenha@1")

        assert fake_user.senha_hash == "novo_hash"
        assert fake_token.usado is True
        mock_db.commit.assert_called()
