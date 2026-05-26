#!/usr/bin/env python3
"""
create_hierarchy_users.py
=========================
Cria usuários de teste para TODOS os fluxos hierárquicos do SisPGeo,
cobrindo todos os Comandos Militares de Área e todos os órgãos consolidadores.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FLUXO COTER (8 Comandos Militares de Área):
    SOLICITANTE (OM)
      → SUPERVISOR_CML / SUPERVISOR_CMSE / … (C Mil A)
        → CONSOLIDADOR_COTER
          → GESTOR_CARTOGRAFICO (admin)
            → ANALISTA_CGEO

  FLUXO DEC:
    SOLICITANTE (OM) → CONSOLIDADOR_DEC → GESTOR_CARTOGRAFICO

  FLUXO COLOG:
    SOLICITANTE (OM) → CONSOLIDADOR_COLOG → GESTOR_CARTOGRAFICO

  FLUXO DECEx:
    SOLICITANTE (OM) → CONSOLIDADOR_DECEX → GESTOR_CARTOGRAFICO

  FLUXO DSG (direto):
    SOLICITANTE (OM) → CONSOLIDADOR_DSG → GESTOR_CARTOGRAFICO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REGRA DE SENHA
  Senha = primeiro caractere do local-part maiúsculo + restante + "@1234"
  Satisfaz todos os critérios: uppercase, lowercase, dígito e especial.

  Exemplos:
    subordinado_dec@eb.mil.br  →  Subordinado_dec@1234
    colog@eb.mil.br            →  Colog@1234
    dec@eb.mil.br              →  Dec@1234
    supervisor.cml@eb.mil.br   →  Supervisor.cml@1234

IDEMPOTÊNCIA
  O script verifica a existência prévia de cada usuário pelo e-mail.
  Usuários já cadastrados têm perfil e status atualizados sem duplicação.

Uso:
    # Contra o container local (padrão)
    python scripts/create_hierarchy_users.py

    # Contra outra instância
    python scripts/create_hierarchy_users.py --base-url http://meuservidor:8000/api/v1

    # Apenas exibir o que seria criado, sem executar
    python scripts/create_hierarchy_users.py --dry-run

    # Pular usuários já existentes (não atualizar perfil/status)
    python scripts/create_hierarchy_users.py --skip-existing
"""

import argparse
import getpass
import os
import sys
import time
from pathlib import Path
from typing import Any

try:
    import httpx
except ImportError:
    print("Instale httpx: pip install httpx")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------

BASE_URL_DEFAULT = "http://localhost:8000/api/v1"
ADMIN_EMAIL      = "admin@eb.mil.br"


def _read_admin_senha_from_env() -> str | None:
    """Tenta ler ADMIN_PASSWORD do .env na raiz do projeto (2 níveis acima)."""
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("ADMIN_PASSWORD="):
            val = line.split("=", 1)[1].strip()
            if val:
                return val
    return None


def _make_senha(email: str) -> str:
    """Gera senha a partir do local-part do e-mail.

    Regra: primeiro caractere maiúsculo + restante + '@1234'
    Satisfaz todos os requisitos de complexidade do SisPGeo:
      ✓ Mínimo 8 caracteres
      ✓ Letra maiúscula
      ✓ Letra minúscula
      ✓ Dígito
      ✓ Caractere especial (@)
    """
    local = email.split("@")[0]
    return local[0].upper() + local[1:] + "@1234"


def _u(
    nome: str,
    guerra: str,
    email: str,
    tel: str,
    om: str,
    secao: str,
    regiao: str | None,
    orgao: str | None,
    perfil: str,
    grupo: str,
    descricao: str,
    *,
    cgeo_id: int | None = None,
) -> dict:
    """Constrói um registro de usuário de forma compacta."""
    return {
        "nome":             nome,
        "nome_de_guerra":   guerra,
        "email":            email,
        "senha":            _make_senha(email),
        "telefone":         tel,
        "om":               om,
        "secao_om":         secao,
        "regiao_militar":   regiao,
        "orgao_vinculante": orgao,
        "perfil":           perfil,
        "cgeo_id":          cgeo_id,
        "grupo":            grupo,
        "descricao":        descricao,
    }


# ---------------------------------------------------------------------------
# Catálogo completo de usuários de teste
# ---------------------------------------------------------------------------

HIERARQUIA: list[dict] = [

    # ══════════════════════════════════════════════════════════════════════════
    # CGEO — Analista executor (atribuído pelo Gestor Cartográfico / DSG)
    # ══════════════════════════════════════════════════════════════════════════
    _u(
        "Ricardo Analista CGeo", "Ricardo",
        "analista.cgeo@eb.mil.br", "(92) 99900-0001",
        "1º CGeo", "Seção de Produção Cartográfica",
        "CMA", "DSG", "ANALISTA_CGEO", "CGEO",
        "Analista CGEO — analisa viabilidade e disponibiliza produtos no BDGEx (1º CGeo, Manaus/CMA)",
        cgeo_id=1,
    ),

    # ══════════════════════════════════════════════════════════════════════════
    # FLUXO COTER
    # SOLICITANTE → SUPERVISOR_CML/CMSE/… (C Mil A) → CONSOLIDADOR_COTER → DSG
    # ══════════════════════════════════════════════════════════════════════════

    # ── Consolidador COTER ────────────────────────────────────────────────────
    _u(
        "Carlos Consolidador COTER", "Carlos",
        "consolidador.coter@eb.mil.br", "(61) 99900-0010",
        "COTER", "Seção de Geoinformação e Cartografia",
        "CMP", "COTER", "CONSOLIDADOR_COTER", "COTER",
        "Consolidador COTER — consolida pedidos de todos os C Mil A e envia à DSG (Brasília/CMP)",
    ),

    # ── Supervisores — um por Comando Militar de Área ─────────────────────────
    _u(
        "Otávio Supervisor Leste", "Otávio",
        "supervisor.cml@eb.mil.br", "(21) 99900-0011",
        "CMDO C M LESTE", "SSGeoInt",
        "CML", "COTER", "SUPERVISOR_CML", "COTER",
        "Supervisor CML (Rio de Janeiro) — revisa pedidos das OM do C Mil Leste",
    ),
    _u(
        "Beatriz Supervisor Sudeste", "Beatriz",
        "supervisor.cmse@eb.mil.br", "(11) 99900-0012",
        "CMDO C M SUDESTE", "SSGeoInt",
        "CMSE", "COTER", "SUPERVISOR_CMSE", "COTER",
        "Supervisor CMSE (São Paulo) — revisa pedidos das OM do C Mil Sudeste",
    ),
    _u(
        "Diego Supervisor Sul", "Diego",
        "supervisor.cms@eb.mil.br", "(51) 99900-0013",
        "CMDO C M SUL", "SSGeoInt",
        "CMS", "COTER", "SUPERVISOR_CMS", "COTER",
        "Supervisor CMS (Porto Alegre) — revisa pedidos das OM do C Mil Sul",
    ),
    _u(
        "Paulo Supervisor Planalto", "Paulo",
        "supervisor.cmp@eb.mil.br", "(61) 99900-0014",
        "CMDO C M PLANALTO", "SSGeoInt",
        "CMP", "COTER", "SUPERVISOR_CMP", "COTER",
        "Supervisor CMP (Brasília) — revisa pedidos das OM do C Mil Planalto",
    ),
    _u(
        "Fernando Supervisor Oeste", "Fernando",
        "supervisor.cmo@eb.mil.br", "(67) 99900-0015",
        "CMDO C M OESTE", "SSGeoInt",
        "CMO", "COTER", "SUPERVISOR_CMO", "COTER",
        "Supervisor CMO (Campo Grande) — revisa pedidos das OM do C Mil Oeste",
    ),
    _u(
        "Miriam Supervisor Amaz Ocidental", "Miriam",
        "supervisor.cmao@eb.mil.br", "(95) 99900-0016",
        "CMDO C M AMAZ OCID", "SSGeoInt",
        "CMAO", "COTER", "SUPERVISOR_CMAO", "COTER",
        "Supervisor CMAO (Boa Vista) — revisa pedidos das OM do C Mil Amaz. Ocidental",
    ),
    _u(
        "Rafael Supervisor Amazônia", "Rafael",
        "supervisor.cma@eb.mil.br", "(92) 99900-0017",
        "CMDO C M AMAZÔNIA", "SSGeoInt",
        "CMA", "COTER", "SUPERVISOR_CMA", "COTER",
        "Supervisor CMA (Manaus) — revisa pedidos das OM do C Mil Amazônia",
    ),
    _u(
        "Cláudio Supervisor Nordeste", "Cláudio",
        "supervisor.cmne@eb.mil.br", "(81) 99900-0018",
        "CMDO C M NORDESTE", "SSGeoInt",
        "CMNE", "COTER", "SUPERVISOR_CMNE", "COTER",
        "Supervisor CMNE (Recife) — revisa pedidos das OM do C Mil Nordeste",
    ),

    # ── Solicitantes COTER — um por Comando Militar de Área ───────────────────
    # Fluxo: SOLICITANTE → SUPERVISOR_CML/… → CONSOLIDADOR_COTER → DSG → CGEO
    _u(
        "Ana Lima", "Ana",
        "subordinado_coter_leste@eb.mil.br", "(21) 99901-0001",
        "1ª Bda Inf Mtz", "S3 - Operações",
        "CML", "COTER", "SOLICITANTE", "COTER",
        "Solicitante CML — pedido: OM → CML (supervisor) → COTER → DSG → CGEO",
    ),
    _u(
        "Bruno Souza", "Bruno",
        "subordinado_coter_sudeste@eb.mil.br", "(11) 99901-0002",
        "2ª Bda Inf Mtz", "S3 - Operações",
        "CMSE", "COTER", "SOLICITANTE", "COTER",
        "Solicitante CMSE — pedido: OM → CMSE (supervisor) → COTER → DSG → CGEO",
    ),
    _u(
        "Carla Santos", "Carla",
        "subordinado_coter_sul@eb.mil.br", "(51) 99901-0003",
        "3ª Bda Cav Mec", "S3 - Operações",
        "CMS", "COTER", "SOLICITANTE", "COTER",
        "Solicitante CMS — pedido: OM → CMS (supervisor) → COTER → DSG → CGEO",
    ),
    _u(
        "Daniel Costa", "Daniel",
        "subordinado_coter_planalto@eb.mil.br", "(61) 99901-0004",
        "11ª Bda Inf L Amv", "S3 - Operações",
        "CMP", "COTER", "SOLICITANTE", "COTER",
        "Solicitante CMP — pedido: OM → CMP (supervisor) → COTER → DSG → CGEO",
    ),
    _u(
        "Eduardo Gomes", "Eduardo",
        "subordinado_coter_oeste@eb.mil.br", "(67) 99901-0005",
        "18ª Bda Inf Fron", "S3 - Operações",
        "CMO", "COTER", "SOLICITANTE", "COTER",
        "Solicitante CMO — pedido: OM → CMO (supervisor) → COTER → DSG → CGEO",
    ),
    _u(
        "Fátima Alves", "Fátima",
        "subordinado_coter_amazonia_oc@eb.mil.br", "(95) 99901-0006",
        "8ª Bda Inf Sl", "S3 - Operações",
        "CMAO", "COTER", "SOLICITANTE", "COTER",
        "Solicitante CMAO — pedido: OM → CMAO (supervisor) → COTER → DSG → CGEO",
    ),
    _u(
        "Henrique Matos", "Henrique",
        "subordinado_coter_amazonia@eb.mil.br", "(92) 99901-0007",
        "16ª Bda Inf Sl", "S3 - Operações",
        "CMA", "COTER", "SOLICITANTE", "COTER",
        "Solicitante CMA — pedido: OM → CMA (supervisor) → COTER → DSG → CGEO",
    ),
    _u(
        "Isabel Rocha", "Isabel",
        "subordinado_coter_nordeste@eb.mil.br", "(81) 99901-0008",
        "72ª Bda Inf Mtz", "S3 - Operações",
        "CMNE", "COTER", "SOLICITANTE", "COTER",
        "Solicitante CMNE — pedido: OM → CMNE (supervisor) → COTER → DSG → CGEO",
    ),

    # ══════════════════════════════════════════════════════════════════════════
    # FLUXO DEC
    # SOLICITANTE (OM) → CONSOLIDADOR_DEC → GESTOR_CARTOGRAFICO
    # Nota: não há Supervisor CMilA intermediário neste fluxo.
    # ══════════════════════════════════════════════════════════════════════════
    _u(
        "Luís Consolidador DEC", "Luís",
        "dec@eb.mil.br", "(61) 99902-0001",
        "DEC", "Seção de Geoinformação",
        "CMP", "DEC", "CONSOLIDADOR_DEC", "DEC",
        "Consolidador DEC — recebe pedidos diretos das OM subordinadas ao DEC e envia à DSG (Brasília/CMP)",
    ),
    _u(
        "Natália Solicitante DEC", "Natália",
        "subordinado_dec@eb.mil.br", "(61) 99902-0002",
        "Centro de Instrução de Infantaria", "S3 - Operações",
        "CMP", "DEC", "SOLICITANTE", "DEC",
        "Solicitante DEC — pedido: OM → CONSOLIDADOR_DEC → DSG → CGEO (Brasília/CMP, sem C Mil A)",
    ),

    # ══════════════════════════════════════════════════════════════════════════
    # FLUXO COLOG
    # SOLICITANTE (OM) → CONSOLIDADOR_COLOG → GESTOR_CARTOGRAFICO
    # Nota: não há Supervisor CMilA intermediário neste fluxo.
    # ══════════════════════════════════════════════════════════════════════════
    _u(
        "Osvaldo Consolidador COLOG", "Osvaldo",
        "colog@eb.mil.br", "(61) 99903-0001",
        "COLOG", "Seção de Geoinformação",
        "CMP", "COLOG", "CONSOLIDADOR_COLOG", "COLOG",
        "Consolidador COLOG — recebe pedidos diretos das OM subordinadas ao COLOG e envia à DSG (Brasília/CMP)",
    ),
    _u(
        "Quintino Solicitante COLOG", "Quintino",
        "subordinado_colog@eb.mil.br", "(61) 99903-0002",
        "1ª Região Logística", "S4 - Logística",
        "CMP", "COLOG", "SOLICITANTE", "COLOG",
        "Solicitante COLOG — pedido: OM → CONSOLIDADOR_COLOG → DSG → CGEO (Brasília/CMP, sem C Mil A)",
    ),

    # ══════════════════════════════════════════════════════════════════════════
    # FLUXO DECEx
    # SOLICITANTE (OM) → CONSOLIDADOR_DECEX → GESTOR_CARTOGRAFICO
    # Nota: não há Supervisor CMilA intermediário neste fluxo.
    # ══════════════════════════════════════════════════════════════════════════
    _u(
        "Roberto Consolidador DECEx", "Roberto",
        "consolidador.decex@eb.mil.br", "(61) 99904-0001",
        "DECEx", "Seção de Geoinformação",
        "CMP", "DECEx", "CONSOLIDADOR_DECEX", "DECEx",
        "Consolidador DECEx — recebe pedidos diretos das OM subordinadas ao DECEx e envia à DSG (Brasília/CMP)",
    ),
    _u(
        "Tiago Solicitante DECEx", "Tiago",
        "subordinado_decex@eb.mil.br", "(11) 99904-0002",
        "ESPCEX", "Seção de Instrução",
        "CMSE", "DECEx", "SOLICITANTE", "DECEx",
        "Solicitante DECEx — pedido: OM → CONSOLIDADOR_DECEX → DSG → CGEO (ESPCEX/Campinas, CMSE, sem C Mil A)",
    ),

    # ══════════════════════════════════════════════════════════════════════════
    # FLUXO DSG (direto)
    # SOLICITANTE (OM) → CONSOLIDADOR_DSG → GESTOR_CARTOGRAFICO (admin)
    # Nota: fluxo mais curto — sem supervisor nem consolidador intermediário.
    # ══════════════════════════════════════════════════════════════════════════
    _u(
        "Ulises Consolidador DSG", "Ulises",
        "dsg@eb.mil.br", "(21) 99905-0001",
        "DSG", "Seção de Geoinformação",
        "CML", "DSG", "CONSOLIDADOR_DSG", "DSG",
        "Consolidador DSG — recebe pedidos de OM diretamente subordinadas à DSG (Rio de Janeiro/CML)",
    ),
    _u(
        "Vera Solicitante DSG", "Vera",
        "subordinado_dsg@eb.mil.br", "(21) 99905-0002",
        "1º CTEx", "S3 - Operações",
        "CML", "DSG", "SOLICITANTE", "DSG",
        "Solicitante DSG — pedido: OM → CONSOLIDADOR_DSG → Gestor Cartográfico (1º CTEx/Rio/CML)",
    ),
]

# ---------------------------------------------------------------------------
# Labels legíveis para impressão
# ---------------------------------------------------------------------------

PERFIL_LABEL: dict[str, str] = {
    "SOLICITANTE":         "Solicitante OMDS",
    # Supervisores específicos por CMilA
    "SUPERVISOR_CML":      "Supervisor CML (Leste)",
    "SUPERVISOR_CMSE":     "Supervisor CMSE (Sudeste)",
    "SUPERVISOR_CMS":      "Supervisor CMS (Sul)",
    "SUPERVISOR_CMP":      "Supervisor CMP (Planalto)",
    "SUPERVISOR_CMO":      "Supervisor CMO (Oeste)",
    "SUPERVISOR_CMAO":     "Supervisor CMAO (Amaz. Ocid.)",
    "SUPERVISOR_CMA":      "Supervisor CMA (Amazônia)",
    "SUPERVISOR_CMNE":     "Supervisor CMNE (Nordeste)",
    # Consolidadores por órgão
    "CONSOLIDADOR_COTER":  "Consolidador COTER",
    "CONSOLIDADOR_DSG":    "Consolidador DSG",
    "CONSOLIDADOR_DEC":    "Consolidador DEC",
    "CONSOLIDADOR_COLOG":  "Consolidador COLOG",
    "CONSOLIDADOR_DECEX":  "Consolidador DECEx",
    # Outros
    "GESTOR_CARTOGRAFICO": "Gestor Cartográfico (DSG)",
    "ANALISTA_CGEO":       "Analista CGEO",
}

GRUPO_HEADER: dict[str, str] = {
    "CGEO":  "CGEO — Executor",
    "COTER": "COTER — SOLICITANTE → C Mil A (Supervisor) → CONSOLIDADOR_COTER → DSG",
    "DEC":   "DEC   — SOLICITANTE → CONSOLIDADOR_DEC → DSG  (sem C Mil A)",
    "COLOG": "COLOG — SOLICITANTE → CONSOLIDADOR_COLOG → DSG (sem C Mil A)",
    "DECEx": "DECEx — SOLICITANTE → CONSOLIDADOR_DECEX → DSG (sem C Mil A)",
    "DSG":   "DSG   — SOLICITANTE → CONSOLIDADOR_DSG → Gestor Cartográfico",
}

SEP  = "─" * 72
SEP2 = "═" * 72


def ok(msg: str)   -> None: print(f"  \033[32m✓\033[0m {msg}")
def err(msg: str)  -> None: print(f"  \033[31m✗\033[0m {msg}", file=sys.stderr)
def info(msg: str) -> None: print(f"  \033[34m→\033[0m {msg}")
def warn(msg: str) -> None: print(f"  \033[33m⚠\033[0m {msg}")


def print_card(u: dict, idx: int, total: int) -> None:
    print(f"\n{SEP}")
    print(f"  [{idx+1}/{total}] {PERFIL_LABEL.get(u['perfil'], u['perfil'])}"
          + f"  |  Grupo: {u['grupo']}")
    print(f"       {u['nome']} <{u['email']}>")
    print(f"       OM: {u['om']}  |  Região: {u['regiao_militar'] or '—'}"
          + (f"  |  Vínculo: {u['orgao_vinculante']}" if u["orgao_vinculante"] else ""))
    print(f"       Senha: {u['senha']}")
    print(f"       {u['descricao']}")
    print(SEP)


# ---------------------------------------------------------------------------
# Helpers de API
# ---------------------------------------------------------------------------

def admin_login(client: httpx.Client, senha: str) -> str:
    r = client.post("/auth/login", json={"email": ADMIN_EMAIL, "senha": senha})
    if r.status_code != 200:
        print(f"\n\033[31mFalha no login do admin: {r.status_code} — {r.text}\033[0m")
        print("Verifique a senha do admin no .env (ADMIN_PASSWORD) ou use --admin-senha.")
        sys.exit(1)
    token = r.json()["access_token"]
    ok(f"Admin autenticado ({ADMIN_EMAIL})")
    return token


def get_all_users(client: httpx.Client, token: str) -> dict[str, dict]:
    """Retorna mapa email → usuário para verificar existência e status."""
    headers = {"Authorization": f"Bearer {token}"}
    r = client.get("/users/", headers=headers)
    if r.status_code != 200:
        return {}
    return {u["email"]: u for u in r.json()}


def register_user(client: httpx.Client, u: dict) -> tuple[bool, str]:
    """Registra o usuário via /auth/register. Retorna (sucesso, mensagem)."""
    payload: dict[str, Any] = {
        "nome":             u["nome"],
        "email":            u["email"],
        "senha":            u["senha"],
        "telefone":         u["telefone"],
        "om":               u["om"],
        "secao_om":         u["secao_om"],
        "regiao_militar":   u["regiao_militar"],
        "orgao_vinculante": u["orgao_vinculante"],
    }
    if u.get("nome_de_guerra"):
        payload["nome_de_guerra"] = u["nome_de_guerra"]

    r = client.post("/auth/register", json=payload)
    if r.status_code == 201:
        return True, "Cadastro realizado"
    if r.status_code == 400 and "já cadastrado" in r.text:
        return False, "E-mail já cadastrado — perfil será atualizado"
    return False, f"Erro {r.status_code}: {r.text}"


def activate_and_set_profile(
    client: httpx.Client,
    token: str,
    user_id: int,
    u: dict,
    is_active: bool,
) -> None:
    """Ativa o usuário (se necessário) e define perfil + orgao_vinculante + cgeo_id.

    Ao ativar via PUT /users/{id}/activate, o backend também marca
    email_confirmado=True, dispensando confirmação por e-mail.
    """
    headers = {"Authorization": f"Bearer {token}"}

    # Ativa apenas se ainda não estiver ativo (toggle é destrutivo)
    if not is_active:
        r = client.put(f"/users/{user_id}/activate", headers=headers)
        if r.status_code == 200:
            ok("Ativado (ativo=True, email_confirmado=True)")
        else:
            err(f"Falha ao ativar: {r.status_code} — {r.text}")
    else:
        ok("Já estava ativo")

    # Define perfil, orgao_vinculante, regiao_militar e cgeo_id
    profile_payload: dict[str, Any] = {"perfil": u["perfil"]}
    if u.get("orgao_vinculante"):
        profile_payload["orgao_vinculante"] = u["orgao_vinculante"]
    if u.get("regiao_militar"):
        profile_payload["regiao_militar"] = u["regiao_militar"]
    if u.get("cgeo_id"):
        profile_payload["cgeo_id"] = u["cgeo_id"]

    r2 = client.put(f"/users/{user_id}/profile", json=profile_payload, headers=headers)
    if r2.status_code == 200:
        label  = PERFIL_LABEL.get(u["perfil"], u["perfil"])
        vinc   = f"  vínculo={u['orgao_vinculante']}" if u.get("orgao_vinculante") else ""
        cgeo   = f"  cgeo_id={u['cgeo_id']}"          if u.get("cgeo_id")          else ""
        ok(f"Perfil: {label}{vinc}{cgeo}")
    else:
        err(f"Falha ao definir perfil: {r2.status_code} — {r2.text}")


# ---------------------------------------------------------------------------
# Fluxo principal
# ---------------------------------------------------------------------------

def run(base_url: str, dry_run: bool, skip_existing: bool, admin_senha: str | None) -> None:
    total = len(HIERARQUIA)

    print(f"\n{SEP2}")
    print(f"\033[1m  SisPGeo — Criação de Usuários de Hierarquia Completa\033[0m")
    print(f"  {total} usuários · 5 fluxos · 8 Comandos Militares de Área")
    print(f"  Backend: {base_url}")
    print(SEP2)

    if dry_run:
        warn("[DRY-RUN] Nenhuma alteração será realizada.\n")

    # Resolver senha do admin: argumento > variável de ambiente > .env > prompt interativo
    if not admin_senha:
        admin_senha = os.environ.get("ADMIN_PASSWORD", "").strip()
        if admin_senha:
            ok("ADMIN_PASSWORD lida da variável de ambiente (ADMIN_PASSWORD)")

    if not admin_senha:
        admin_senha = _read_admin_senha_from_env()
        if admin_senha:
            ok("ADMIN_PASSWORD lida do .env")

    if not admin_senha:
        # Sem TTY (ex: docker exec sem -it) → mensagem clara em vez de travar
        if not sys.stdin.isatty():
            print(
                "\033[31m\n  Senha do admin não encontrada e não há terminal interativo.\n"
                "  Passe a senha de uma das formas abaixo:\n\n"
                "    # Argumento direto:\n"
                "    docker exec sispgeo_backend python scripts/create_hierarchy_users.py"
                " --admin-senha 'SuaSenha'\n\n"
                "    # Variável de ambiente no docker exec:\n"
                "    docker exec -e ADMIN_PASSWORD='SuaSenha' sispgeo_backend"
                " python scripts/create_hierarchy_users.py\n\n"
                "    # Ou adicione ADMIN_PASSWORD=xxx ao .env do backend\n"
                "\033[0m"
            )
            sys.exit(1)
        print(f"\n  Senha do admin ({ADMIN_EMAIL}) não encontrada no .env.")
        try:
            admin_senha = getpass.getpass("  ADMIN_PASSWORD: ")
        except Exception:
            admin_senha = input("  ADMIN_PASSWORD (visível): ").strip()
        if not admin_senha:
            print("\033[31mSenha não pode ser vazia.\033[0m")
            sys.exit(1)

    with httpx.Client(base_url=base_url, timeout=20) as client:
        # Aguarda o backend inicializar (até 90 s)
        _MAX_WAIT = 90
        _waited   = 0
        while True:
            try:
                h = client.get("/health")
                ok(f"Backend respondendo — versão {h.json().get('version', '?')}\n")
                break
            except Exception as exc:
                if _waited >= _MAX_WAIT:
                    print(f"\033[31mBackend inacessível em {base_url} após {_MAX_WAIT}s: {exc}\033[0m")
                    sys.exit(1)
                print(f"\033[33mAguardando backend… ({_waited}s / {_MAX_WAIT}s)\033[0m", end="\r")
                time.sleep(3)
                _waited += 3

        if dry_run:
            current_grupo = ""
            for i, u in enumerate(HIERARQUIA):
                if u["grupo"] != current_grupo:
                    current_grupo = u["grupo"]
                    print(f"\n\033[1m  {GRUPO_HEADER.get(current_grupo, current_grupo)}\033[0m")
                print_card(u, i, total)
            print(f"\n  {total} usuários seriam criados/atualizados.")
            return

        token        = admin_login(client, admin_senha)
        existing     = get_all_users(client, token)
        results: list[dict] = []

        for i, u in enumerate(HIERARQUIA):
            print_card(u, i, total)

            already_exists = u["email"] in existing

            if already_exists and skip_existing:
                info("Pulando (já existe e --skip-existing ativo)")
                results.append({**u, "id": existing[u["email"]]["id"], "action": "skip"})
                continue

            if already_exists:
                info("Usuário já cadastrado — atualizando perfil e status")
                user_id   = existing[u["email"]]["id"]
                is_active = existing[u["email"]].get("ativo", False)
            else:
                registered, msg = register_user(client, u)
                if registered:
                    ok(msg)
                else:
                    info(msg)   # "já cadastrado" é info, não erro

                # Aguarda propagação e re-carrega mapa
                time.sleep(0.4)
                existing = get_all_users(client, token)

                if u["email"] not in existing:
                    err("Usuário não encontrado após cadastro — pulando")
                    continue

                user_id   = existing[u["email"]]["id"]
                is_active = existing[u["email"]].get("ativo", False)

            activate_and_set_profile(client, token, user_id, u, is_active)
            results.append({**u, "id": user_id, "action": "ok"})

        # ── Resumo final ─────────────────────────────────────────────────────
        print(f"\n{SEP2}")
        print(f"\033[1m  RESUMO — Credenciais de acesso ({len(results)} usuários)\033[0m")
        print(f"  Regra de senha: <local-part[0].upper()><local-part[1:]>@1234")
        print(f"  Exemplo: subordinado_dec@eb.mil.br → Subordinado_dec@1234")
        print(SEP2)

        current_grupo = ""
        for r in results:
            if r["grupo"] != current_grupo:
                current_grupo = r["grupo"]
                print(f"\n  \033[1m{GRUPO_HEADER.get(current_grupo, current_grupo)}\033[0m")
                print(f"  {'Perfil':<32} {'E-mail':<42} {'Senha'}")
                print(f"  {'-'*32} {'-'*42} {'-'*24}")

            label  = PERFIL_LABEL.get(r["perfil"], r["perfil"])
            status = "" if r.get("action") != "skip" else " [pulado]"
            print(f"  {label:<32} {r['email']:<42} {r['senha']}{status}")

        # Lembrar do admin (Gestor Cartográfico)
        print(f"\n  \033[1mAdmin / Gestor Cartográfico (DSG)\033[0m")
        print(f"  {'Gestor Cartográfico (DSG)':<32} {'admin@eb.mil.br':<42} (senha em ADMIN_PASSWORD no .env)")

        print(f"\n{SEP2}")
        processados = sum(1 for r in results if r.get("action") != "skip")
        print(f"  \033[32m✓ {processados} usuários criados/atualizados"
              + (f", {len(results)-processados} pulados" if len(results) > processados else "")
              + f".\033[0m")
        print(f"  Acesse: {base_url.replace('/api/v1', '')}/\n")


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Cria usuários de teste para todos os fluxos hierárquicos do SisPGeo "
            "(COTER, DEC, COLOG, DECEx, DSG)."
        )
    )
    parser.add_argument(
        "--base-url",
        default=BASE_URL_DEFAULT,
        help=f"URL base da API (padrão: {BASE_URL_DEFAULT})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Apenas exibe o que seria criado, sem executar.",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Pula usuários já cadastrados em vez de atualizar perfil/status.",
    )
    parser.add_argument(
        "--admin-senha",
        default=None,
        metavar="SENHA",
        help="Senha do admin (padrão: lida do .env ou solicitada interativamente).",
    )
    args = parser.parse_args()
    run(args.base_url, args.dry_run, args.skip_existing, args.admin_senha)
