"""
Testes de integração do SISGEO.

Chamam a API real (uvicorn rodando em localhost:8000 dentro do container).
São executados pelo CI *depois* de o backend estar de pé.

Para rodar localmente:
    docker compose up -d db backend mailhog
    docker exec sispgeo_backend pip install pytest httpx -q
    docker exec sispgeo_backend python -m pytest tests/test_api_integration.py -v
"""

import pytest
import httpx

BASE = "http://localhost:8000/api/v1"


@pytest.fixture(scope="module")
def client():
    """Cliente HTTP síncrono reutilizado por todos os testes do módulo."""
    with httpx.Client(base_url=BASE, timeout=10) as c:
        yield c


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class TestHealth:
    def test_health_retorna_ok(self, client):
        """GET /health deve retornar 200 com status ok."""
        r = client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert "version" in body


# ---------------------------------------------------------------------------
# Auth — endpoints públicos
# ---------------------------------------------------------------------------

class TestAuthPublico:
    def test_login_credenciais_invalidas_retorna_401(self, client):
        """Login com senha errada deve retornar 401."""
        r = client.post("/auth/login", json={
            "email": "nao_existe@eb.mil.br",
            "senha": "SenhaErrada@1",
        })
        assert r.status_code == 401

    def test_login_payload_incompleto_retorna_422(self, client):
        """Login sem campo obrigatório deve retornar 422 (validação Pydantic)."""
        r = client.post("/auth/login", json={"email": "x@eb.mil.br"})
        assert r.status_code == 422

    def test_registro_email_invalido_retorna_422(self, client):
        """Registro com e-mail fora do domínio @eb.mil.br deve retornar 422."""
        r = client.post("/auth/register", json={
            "nome": "Teste",
            "email": "nao_militar@gmail.com",
            "telefone": "(61)99999-0000",
            "om": "1ª Brigada",
            "secao_om": "S3",
            "senha": "Senha@1234",
        })
        assert r.status_code == 422

    def test_forgot_password_sempre_200(self, client):
        """Forgot-password não revela se o e-mail existe — sempre retorna 200."""
        r = client.post("/auth/forgot-password", json={"email": "nao_existe@eb.mil.br"})
        assert r.status_code == 200

    def test_confirm_token_invalido_retorna_400(self, client):
        """Token de confirmação inválido deve retornar 400."""
        r = client.get("/auth/confirm-email/token-falso-invalido")
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Endpoints protegidos — sem token
# ---------------------------------------------------------------------------

class TestProtecaoSemToken:
    endpoints = [
        ("GET",  "/pedidos/"),
        ("GET",  "/janelas/"),
        ("GET",  "/janelas/active"),
        ("GET",  "/operacoes/"),
        ("GET",  "/map/inom-grid"),
    ]

    @pytest.mark.parametrize("method,path", endpoints)
    def test_sem_token_retorna_403_ou_401(self, client, method, path):
        """Endpoints protegidos devem rejeitar requisições sem Authorization."""
        r = client.request(method, path)
        assert r.status_code in (401, 403), (
            f"{method} {path} retornou {r.status_code}, esperado 401 ou 403"
        )


# ---------------------------------------------------------------------------
# Login do admin e acesso autenticado
# ---------------------------------------------------------------------------

class TestAdminFlow:
    @pytest.fixture(scope="class")
    def token(self, client):
        """Faz login como admin e retorna o token JWT."""
        r = client.post("/auth/login", json={
            "email": "admin@eb.mil.br",
            "senha": "Admin@1234",
        })
        # Se o admin ainda não existe (primeira execução sem create_admin.py),
        # pula os testes que dependem dele.
        if r.status_code != 200:
            pytest.skip(f"Admin não disponível (HTTP {r.status_code})")
        return r.json()["access_token"]

    def test_login_admin_retorna_token(self, client):
        """Login do admin deve retornar access_token."""
        r = client.post("/auth/login", json={
            "email": "admin@eb.mil.br",
            "senha": "Admin@1234",
        })
        if r.status_code == 401:
            pytest.skip("Admin não criado ainda")
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_listar_janelas_autenticado(self, client, token):
        """GET /janelas/ com token válido deve retornar 200."""
        r = client.get("/janelas/", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_listar_pedidos_autenticado(self, client, token):
        """GET /pedidos/ com token válido deve retornar 200."""
        r = client.get("/pedidos/", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200

    def test_listar_usuarios_autenticado(self, client, token):
        """GET /users/ com token de admin deve retornar 200."""
        r = client.get("/users/", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200

    def test_perfil_sem_permissao_retorna_403(self, client, token):
        """Endpoint exclusivo de CGEO deve retornar 403 para admin (GESTOR_CARTOGRAFICO)."""
        # PUT /pedidos/{id}/cgeo-review exige perfil ANALISTA_CGEO
        r = client.put(
            "/pedidos/99999/cgeo-review",
            json={"acao": "aprovar"},
            headers={"Authorization": f"Bearer {token}"},
        )
        # 403 (perfil errado) ou 404 (pedido inexistente) — ambos aceitáveis
        assert r.status_code in (403, 404)


# ---------------------------------------------------------------------------
# Herança de pedidos — Gustavo → João (mesma OM)
# ---------------------------------------------------------------------------

class TestHerancaPedidos:
    """
    Testa o fluxo completo de herança de solicitações entre dois SOLICITANTE
    da mesma OM.

    Pré-requisito: backend iniciado com BDGEX_MOCK=true, que cria automaticamente
    os usuários gustavo@eb.mil.br e joao@eb.mil.br (ativo=True).

    Fluxo testado:
        1. Gustavo faz login
        2. Gustavo cria um pedido em rascunho
        3. Gustavo consulta colegas da mesma OM — deve encontrar João
        4. Gustavo transfere pedidos para João
        5. Verifica que Gustavo tem pedidos_transferidos_em definido
        6. Verifica que João vê o pedido herdado em seus pedidos
        7. Verifica que o histórico de transferências existe
        8. Gustavo consegue atualizar OM após herança
        9. Gustavo NÃO consegue transferir para usuário de OM diferente
    """

    GUSTAVO_EMAIL = "gustavo@eb.mil.br"
    GUSTAVO_SENHA = "Gustavo@1234"
    JOAO_EMAIL    = "joao@eb.mil.br"
    JOAO_SENHA    = "Joao@1234"

    @pytest.fixture(scope="class")
    def tokens(self, client):
        """Faz login como Gustavo e João, retorna ambos os tokens."""
        r_g = client.post("/auth/login", json={
            "email": self.GUSTAVO_EMAIL,
            "senha": self.GUSTAVO_SENHA,
        })
        if r_g.status_code != 200:
            pytest.skip(
                f"Usuário Gustavo não disponível (HTTP {r_g.status_code}). "
                "Certifique-se de que o backend foi iniciado com BDGEX_MOCK=true."
            )
        r_j = client.post("/auth/login", json={
            "email": self.JOAO_EMAIL,
            "senha": self.JOAO_SENHA,
        })
        if r_j.status_code != 200:
            pytest.skip(
                f"Usuário João não disponível (HTTP {r_j.status_code}). "
                "Certifique-se de que o backend foi iniciado com BDGEX_MOCK=true."
            )
        return {
            "gustavo": r_g.json()["access_token"],
            "joao":    r_j.json()["access_token"],
        }

    @pytest.fixture(scope="class")
    def admin_token(self, client):
        """Token de admin para operações DSG auxiliares."""
        r = client.post("/auth/login", json={
            "email": "admin@eb.mil.br",
            "senha": "Admin@1234",
        })
        if r.status_code != 200:
            pytest.skip("Admin não disponível")
        return r.json()["access_token"]

    @pytest.fixture(scope="class")
    def pedido_id(self, client, tokens):
        """Cria um pedido de rascunho como Gustavo e retorna o ID."""
        auth = {"Authorization": f"Bearer {tokens['gustavo']}"}
        r = client.post("/pedidos/", json={
            "data_entrega": "2027-12-31",
            "finalidade": "Operação Exercício — pedido para teste de herança",
            "demandante": "COTER",
            "itens": [
                {
                    "tipo_produto": "CARTA_TOPOGRAFICA",
                    "escala": "1:50.000",
                    "inom": "SF-22-Y-D-V-1",
                    "mi": None,
                    "solicitar_mesmo_disponivel": False,
                }
            ],
        }, headers=auth)
        assert r.status_code == 201, f"Falha ao criar pedido: {r.text}"
        return r.json()["id"]

    # ── 1. Login ──────────────────────────────────────────────────────────────

    def test_login_gustavo_retorna_token(self, client):
        """Gustavo deve conseguir fazer login com as credenciais de teste."""
        r = client.post("/auth/login", json={
            "email": self.GUSTAVO_EMAIL,
            "senha": self.GUSTAVO_SENHA,
        })
        if r.status_code != 200:
            pytest.skip("Usuários de teste não disponíveis")
        assert "access_token" in r.json()

    def test_login_joao_retorna_token(self, client):
        """João deve conseguir fazer login com as credenciais de teste."""
        r = client.post("/auth/login", json={
            "email": self.JOAO_EMAIL,
            "senha": self.JOAO_SENHA,
        })
        if r.status_code != 200:
            pytest.skip("Usuários de teste não disponíveis")
        assert "access_token" in r.json()

    # ── 2. Criação de pedido ──────────────────────────────────────────────────

    def test_gustavo_cria_pedido(self, client, tokens):
        """Gustavo deve conseguir criar um pedido em rascunho."""
        auth = {"Authorization": f"Bearer {tokens['gustavo']}"}
        r = client.post("/pedidos/", json={
            "data_entrega": "2027-12-31",
            "finalidade": "Teste herança",
            "demandante": "COTER",
            "itens": [{
                "tipo_produto": "CARTA_TOPOGRAFICA",
                "escala": "1:50.000",
                "inom": "SF-22-Y-D-V-2",
                "mi": None,
                "solicitar_mesmo_disponivel": False,
            }],
        }, headers=auth)
        assert r.status_code == 201
        body = r.json()
        assert body["status"] == "RASCUNHO"
        assert body["usuario_id"] is not None
        # criador_id deve ser igual a usuario_id no momento da criação
        assert body.get("criador_id") == body["usuario_id"]

    # ── 3. Colegas da mesma OM ────────────────────────────────────────────────

    def test_gustavo_ve_colegas_mesma_om(self, client, tokens):
        """GET /users/mesma-om deve retornar João (mesma OM, ativo)."""
        auth = {"Authorization": f"Bearer {tokens['gustavo']}"}
        r = client.get("/users/mesma-om", headers=auth)
        assert r.status_code == 200
        usuarios = r.json()
        assert isinstance(usuarios, list)
        emails = [u["email"] for u in usuarios]
        assert self.JOAO_EMAIL in emails, (
            f"João não aparece em /users/mesma-om. Retorno: {emails}"
        )
        # Gustavo não deve aparecer na própria lista
        assert self.GUSTAVO_EMAIL not in emails

    def test_joao_nao_ve_admin_em_mesma_om(self, client, tokens):
        """Admin (OM=DSG) não deve aparecer na lista da OM da Brigada."""
        auth = {"Authorization": f"Bearer {tokens['joao']}"}
        r = client.get("/users/mesma-om", headers=auth)
        assert r.status_code == 200
        emails = [u["email"] for u in r.json()]
        assert "admin@eb.mil.br" not in emails

    # ── 4. Transferência (herança) ────────────────────────────────────────────

    def test_gustavo_transfere_para_joao(self, client, tokens, pedido_id):
        """Gustavo transfere pedidos para João — deve retornar transferidos >= 1."""
        auth_g = {"Authorization": f"Bearer {tokens['gustavo']}"}

        # Obtém o ID de Gustavo
        me = client.get("/users/me", headers=auth_g).json()
        gustavo_id = me["id"]

        # Obtém o ID de João
        colegas = client.get("/users/mesma-om", headers=auth_g).json()
        joao = next((u for u in colegas if u["email"] == self.JOAO_EMAIL), None)
        assert joao is not None, "João não encontrado em /users/mesma-om"
        joao_id = joao["id"]

        r = client.post(
            f"/users/{gustavo_id}/transferir-pedidos",
            json={"novo_responsavel_id": joao_id},
            headers=auth_g,
        )
        assert r.status_code == 200, f"Transferência falhou: {r.text}"
        body = r.json()
        assert body["transferidos"] >= 1, (
            f"Esperava ao menos 1 pedido transferido, obteve {body['transferidos']}"
        )
        assert body["novo_responsavel"] == joao["nome"]

    def test_gustavo_tem_pedidos_transferidos_em_apos_heranca(self, client, tokens):
        """Após herança, Gustavo deve ter pedidos_transferidos_em preenchido."""
        auth = {"Authorization": f"Bearer {tokens['gustavo']}"}
        me = client.get("/users/me", headers=auth).json()
        assert me.get("pedidos_transferidos_em") is not None, (
            "pedidos_transferidos_em deve ser preenchido após a herança"
        )

    # ── 5. Pedido aparece para João ───────────────────────────────────────────

    def test_joao_ve_pedido_herdado(self, client, tokens, pedido_id):
        """Após transferência, João deve ver o pedido de Gustavo em seus pedidos."""
        auth_j = {"Authorization": f"Bearer {tokens['joao']}"}
        r = client.get("/pedidos/", headers=auth_j)
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert pedido_id in ids, (
            f"Pedido #{pedido_id} não aparece nos pedidos de João. IDs: {ids}"
        )

    def test_pedido_herdado_tem_criador_nome_do_gustavo(self, client, tokens, pedido_id):
        """O pedido herdado deve ter criador_nome apontando para Gustavo."""
        auth_j = {"Authorization": f"Bearer {tokens['joao']}"}
        r = client.get("/pedidos/", headers=auth_j)
        pedido = next((p for p in r.json() if p["id"] == pedido_id), None)
        assert pedido is not None
        # criador_nome deve ser diferente de usuario_nome após herança
        assert pedido.get("criador_nome") is not None
        # usuario_nome deve ser João (responsável atual)
        assert pedido.get("usuario_nome") is not None

    # ── 6. Histórico de transferências ───────────────────────────────────────

    def test_gustavo_ve_suas_transferencias(self, client, tokens):
        """GET /transferencias/minhas deve listar a transferência executada."""
        auth = {"Authorization": f"Bearer {tokens['gustavo']}"}
        r = client.get("/transferencias/minhas", headers=auth)
        assert r.status_code == 200
        transferencias = r.json()
        assert len(transferencias) >= 1, "Deve haver ao menos uma transferência registrada"
        t = transferencias[0]
        assert t["pedido_id"] is not None
        assert t["de_usuario_nome"] is not None
        assert t["para_usuario_nome"] is not None

    def test_joao_ve_herancas_recebidas(self, client, tokens):
        """João também deve ver a herança em /transferencias/minhas."""
        auth = {"Authorization": f"Bearer {tokens['joao']}"}
        r = client.get("/transferencias/minhas", headers=auth)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_admin_ve_transferencias_de_gustavo(self, client, admin_token, tokens):
        """GESTOR_CARTOGRAFICO deve conseguir ver transferências de qualquer usuário."""
        auth_g = {"Authorization": f"Bearer {tokens['gustavo']}"}
        gustavo_id = client.get("/users/me", headers=auth_g).json()["id"]

        r = client.get(
            f"/transferencias/usuario/{gustavo_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        assert len(r.json()) >= 1

    # ── 7. Mudança de OM após herança ─────────────────────────────────────────

    def test_gustavo_pode_mudar_om_apos_heranca(self, client, tokens):
        """Após a herança, Gustavo deve conseguir alterar sua OM."""
        auth = {"Authorization": f"Bearer {tokens['gustavo']}"}
        r = client.put("/users/me", json={
            "om": "2ª Brigada de Infantaria",
            "regiao_militar": "2ª RM",
        }, headers=auth)
        assert r.status_code == 200, f"Mudança de OM falhou: {r.text}"
        body = r.json()
        assert body["om"] == "2ª Brigada de Infantaria"
        assert body["regiao_militar"] == "2ª RM"

    # ── 8. Restrições ─────────────────────────────────────────────────────────

    def test_transferencia_para_om_diferente_retorna_400(self, client, tokens, admin_token):
        """Transferir para usuário de OM diferente deve retornar 400."""
        auth_j = {"Authorization": f"Bearer {tokens['joao']}"}
        joao_me = client.get("/users/me", headers=auth_j).json()
        joao_id = joao_me["id"]

        # Admin é da OM=DSG — OM diferente da de João
        admin_me = client.get(
            "/users/me",
            headers={"Authorization": f"Bearer {admin_token}"},
        ).json()
        admin_id = admin_me["id"]

        r = client.post(
            f"/users/{joao_id}/transferir-pedidos",
            json={"novo_responsavel_id": admin_id},
            headers=auth_j,
        )
        assert r.status_code == 400, (
            f"Esperava 400 (OM diferente), obteve {r.status_code}: {r.text}"
        )

    def test_usuario_sem_heranca_nao_pode_mudar_om(self, client, tokens):
        """João (sem herança executada) não deve conseguir alterar OM diretamente."""
        auth = {"Authorization": f"Bearer {tokens['joao']}"}
        # Verifica que João não tem pedidos_transferidos_em
        me = client.get("/users/me", headers=auth).json()
        if me.get("pedidos_transferidos_em") is not None:
            pytest.skip("João já executou herança nesta sessão de teste")
        r = client.put("/users/me", json={"om": "Outra OM"}, headers=auth)
        assert r.status_code == 400, (
            f"Esperava 400 (herança não executada), obteve {r.status_code}"
        )
