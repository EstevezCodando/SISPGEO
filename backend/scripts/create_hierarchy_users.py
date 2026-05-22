#!/usr/bin/env python3
"""
create_hierarchy_users.py
=========================
Cria um usuário para cada nível hierárquico do fluxo SISGEO,
todos pertencentes ao Comando Militar do Planalto (CMP) / COTER.

Fluxo coberto:
  SOLICITANTE (22º B I / CMP)
      → SUPERVISOR (C. Mil. A Planalto / CMP)
          → CONSOLIDADOR (COTER)
              → GESTOR_CARTOGRAFICO (DSG) ← admin@eb.mil.br, já criado
                  → ANALISTA_CGEO (1º CGeo)

Uso:
    # Contra o container local (padrão)
    python scripts/create_hierarchy_users.py

    # Contra outra instância
    python scripts/create_hierarchy_users.py --base-url http://meuservidor:8000/api/v1

    # Só mostrar o que faria, sem criar
    python scripts/create_hierarchy_users.py --dry-run
"""

import argparse
import sys
import time
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
ADMIN_SENHA      = "Admin@1234"

# Hierarquia completa — Planalto (CMP) / COTER
HIERARQUIA = [
    # ── 1. Solicitante OMDS ──────────────────────────────────────────────────
    # Praça/oficial de uma OM que cria os pedidos de produtos geoespaciais.
    {
        "nome":              "Sgt Gustavo Silva",
        "email":             "gustavo@eb.mil.br",
        "senha":             "Gustavo@1234",
        "telefone":          "(61) 99900-0001",
        "om":                "22º B I",
        "secao_om":          "S3 - Operações",
        "regiao_militar":    "CMP",
        "orgao_vinculante":  "COTER",
        "perfil":            "SOLICITANTE",
        "cgeo_id":           None,
        "descricao":         "Solicitante OMDS — cria pedidos de produtos geoespaciais (22º B I / CMP)",
    },
    # ── 2. Solicitante auxiliar (mesma OM) ───────────────────────────────────
    {
        "nome":              "Cb João Ferreira",
        "email":             "joao@eb.mil.br",
        "senha":             "Joao@1234",
        "telefone":          "(61) 99900-0002",
        "om":                "22º B I",
        "secao_om":          "S3 - Operações",
        "regiao_militar":    "CMP",
        "orgao_vinculante":  "COTER",
        "perfil":            "SOLICITANTE",
        "cgeo_id":           None,
        "descricao":         "Solicitante OMDS auxiliar — testes de herança de pedidos",
    },
    # ── 3. Supervisor C. Mil. A (CMP) ────────────────────────────────────────
    # Revisa e consolida pedidos de todas as OMs do CMP.
    {
        "nome":              "Maj Paulo Supervisor",
        "email":             "supervisor.cmilA@eb.mil.br",
        "senha":             "Supervisor@1234",
        "telefone":          "(61) 99900-0010",
        "om":                "CMDO C M P",
        "secao_om":          "Seção de Geoinformação",
        "regiao_militar":    "CMP",
        "orgao_vinculante":  "COTER",
        "perfil":            "SUPERVISOR",
        "cgeo_id":           None,
        "descricao":         "Supervisor C. Mil. A — Planalto (CMP), encaminha ao COTER",
    },
    # ── 4. Consolidador COTER ────────────────────────────────────────────────
    # Agrupa pedidos de todos os CMilA vinculados ao COTER e envia à DSG.
    {
        "nome":              "TC Carlos Consolidador",
        "email":             "consolidador.coter@eb.mil.br",
        "senha":             "Consolidador@1234",
        "telefone":          "(61) 99900-0020",
        "om":                "COTER",
        "secao_om":          "Seção de Geoinformação e Cartografia",
        "regiao_militar":    "CMP",
        "orgao_vinculante":  "COTER",
        "perfil":            "CONSOLIDADOR",
        "cgeo_id":           None,
        "descricao":         "Consolidador COTER — agrega pedidos de todos os CMilA/COTER e envia à DSG",
    },
    # ── 5. Analista CGEO ─────────────────────────────────────────────────────
    # Analisa viabilidade e entrega produtos no BDGEx.
    {
        "nome":              "Cap Ricardo Analista CGEO",
        "email":             "analista.cgeo@eb.mil.br",
        "senha":             "AnalistaCGEO@1234",
        "telefone":          "(61) 99900-0030",
        "om":                "1º C GEO",
        "secao_om":          "Seção de Produção Cartográfica",
        "regiao_militar":    "CMP",
        "orgao_vinculante":  None,
        "perfil":            "ANALISTA_CGEO",
        "cgeo_id":           1,
        "descricao":         "Analista CGEO — analisa viabilidade e disponibiliza produtos no BDGEx",
    },
]

# ---------------------------------------------------------------------------
# Labels legíveis para impressão
# ---------------------------------------------------------------------------

PERFIL_LABEL = {
    "SOLICITANTE":         "Solicitante OMDS",
    "SUPERVISOR":          "Supervisor C. Mil. A",
    "CONSOLIDADOR":        "Consolidador (COTER/COLOG)",
    "GESTOR_CARTOGRAFICO": "Gestor Cartográfico (DSG)",
    "ANALISTA_CGEO":       "Analista CGEO",
}

SEP = "─" * 65


def ok(msg: str) -> None:
    print(f"  \033[32m✓\033[0m {msg}")


def err(msg: str) -> None:
    print(f"  \033[31m✗\033[0m {msg}", file=sys.stderr)


def info(msg: str) -> None:
    print(f"  \033[34m→\033[0m {msg}")


def print_card(u: dict, idx: int) -> None:
    total = len(HIERARQUIA)
    print(f"\n{SEP}")
    print(f"  [{idx+1}/{total}] {PERFIL_LABEL.get(u['perfil'], u['perfil'])}")
    print(f"       {u['nome']} <{u['email']}>")
    print(f"       OM: {u['om']}  |  CMilA: {u['regiao_militar'] or '—'}"
          + (f"  |  Vínculo: {u['orgao_vinculante']}" if u['orgao_vinculante'] else ""))
    print(f"       {u['descricao']}")
    print(SEP)


# ---------------------------------------------------------------------------
# Helpers de API
# ---------------------------------------------------------------------------

def admin_login(client: httpx.Client) -> str:
    r = client.post("/auth/login", json={"email": ADMIN_EMAIL, "senha": ADMIN_SENHA})
    if r.status_code != 200:
        print(f"\n\033[31mFalha no login do admin: {r.status_code} — {r.text}\033[0m")
        print("Verifique se o backend está rodando e o admin foi criado.")
        sys.exit(1)
    token = r.json()["access_token"]
    ok(f"Admin autenticado ({ADMIN_EMAIL})")
    return token


def get_all_users(client: httpx.Client, token: str) -> dict[str, dict]:
    """Retorna mapa email → usuário para verificar existência."""
    headers = {"Authorization": f"Bearer {token}"}
    r = client.get("/users/", headers=headers)
    if r.status_code != 200:
        return {}
    return {u["email"]: u for u in r.json()}


def register_user(client: httpx.Client, u: dict) -> tuple[bool, str]:
    """Registra o usuário. Retorna (sucesso, mensagem)."""
    payload = {
        "nome":             u["nome"],
        "email":            u["email"],
        "senha":            u["senha"],
        "telefone":         u["telefone"],
        "om":               u["om"],
        "secao_om":         u["secao_om"],
        "regiao_militar":   u["regiao_militar"],
        "orgao_vinculante": u["orgao_vinculante"],
    }
    r = client.post("/auth/register", json=payload)
    if r.status_code == 201:
        return True, "Cadastro realizado"
    if r.status_code == 400 and "já cadastrado" in r.text:
        return False, "E-mail já cadastrado — será atualizado"
    return False, f"Erro {r.status_code}: {r.text}"


def activate_and_set_profile(
    client: httpx.Client, token: str, user_id: int, u: dict
) -> None:
    """Ativa o usuário e define perfil + orgao_vinculante + cgeo_id."""
    headers = {"Authorization": f"Bearer {token}"}

    # Verifica se já está ativo
    r = client.get("/users/", headers=headers)
    users_map = {usr["id"]: usr for usr in r.json()} if r.status_code == 200 else {}
    current = users_map.get(user_id, {})

    if not current.get("ativo", True):
        r2 = client.put(f"/users/{user_id}/activate", headers=headers)
        if r2.status_code == 200:
            ok("Usuário ativado")
        else:
            err(f"Falha ao ativar: {r2.status_code}")
    else:
        ok("Usuário já estava ativo")

    # Define perfil, orgao_vinculante e cgeo_id
    profile_payload: dict[str, Any] = {"perfil": u["perfil"]}
    if u.get("orgao_vinculante"):
        profile_payload["orgao_vinculante"] = u["orgao_vinculante"]
    if u.get("cgeo_id"):
        profile_payload["cgeo_id"] = u["cgeo_id"]

    r3 = client.put(f"/users/{user_id}/profile", json=profile_payload, headers=headers)
    if r3.status_code == 200:
        label = PERFIL_LABEL.get(u["perfil"], u["perfil"])
        vinculo = f"  vínculo={u['orgao_vinculante']}" if u.get("orgao_vinculante") else ""
        cgeo = f"  cgeo_id={u['cgeo_id']}" if u.get("cgeo_id") else ""
        ok(f"Perfil definido: {label}{vinculo}{cgeo}")
    else:
        err(f"Falha ao definir perfil: {r3.status_code} — {r3.text}")


# ---------------------------------------------------------------------------
# Fluxo principal
# ---------------------------------------------------------------------------

def run(base_url: str, dry_run: bool, skip_existing: bool) -> None:
    print(f"\n\033[1mSISGEO — Criação da Hierarquia CMP / COTER\033[0m")
    print(f"Backend: {base_url}")
    print(f"Fluxo: SOLICITANTE → SUPERVISOR (CMP) → CONSOLIDADOR (COTER) → DSG")
    if dry_run:
        print("\033[33m[DRY-RUN] Nenhuma alteração será realizada.\033[0m")

    with httpx.Client(base_url=base_url, timeout=15) as client:
        # Verifica saúde do backend — retry por até 60 s (startup demora mais
        # agora por causa da carga inicial do GeoJSON no Postgres)
        _MAX_WAIT = 60
        _waited   = 0
        while True:
            try:
                h = client.get("/health")
                ok(f"Backend respondendo — versão {h.json().get('version', '?')}")
                break
            except Exception as e:
                if _waited >= _MAX_WAIT:
                    print(f"\033[31mBackend inacessível em {base_url} após {_MAX_WAIT}s: {e}\033[0m")
                    sys.exit(1)
                print(f"\033[33mAguardando backend… ({_waited}s / {_MAX_WAIT}s)\033[0m", end="\r")
                time.sleep(3)
                _waited += 3

        if dry_run:
            print(f"\n\033[1mUsuários que seriam criados ({len(HIERARQUIA)}):\033[0m")
            for i, u in enumerate(HIERARQUIA):
                print_card(u, i)
                info(f"Senha: {u['senha']}")
            return

        token = admin_login(client)
        existing_users = get_all_users(client, token)

        results: list[dict] = []

        for i, u in enumerate(HIERARQUIA):
            print_card(u, i)
            already_exists = u["email"] in existing_users

            if already_exists and skip_existing:
                info("Pulando (já existe e --skip-existing ativo)")
                user_id = existing_users[u["email"]]["id"]
            else:
                if already_exists:
                    info("Usuário já existe — atualizando perfil e status")
                    user_id = existing_users[u["email"]]["id"]
                else:
                    registered, msg = register_user(client, u)
                    if registered:
                        ok(msg)
                        time.sleep(0.5)
                        existing_users = get_all_users(client, token)
                        if u["email"] not in existing_users:
                            err("Usuário não encontrado após cadastro")
                            continue
                        user_id = existing_users[u["email"]]["id"]
                    else:
                        err(msg)
                        existing_users = get_all_users(client, token)
                        if u["email"] not in existing_users:
                            continue
                        user_id = existing_users[u["email"]]["id"]

                activate_and_set_profile(client, token, user_id, u)

            results.append({**u, "id": user_id})

        # ── Resumo final ─────────────────────────────────────────────────────
        print(f"\n{SEP}")
        print("\033[1m  RESUMO — Credenciais de acesso\033[0m")
        print(SEP)
        hdr_perfil = "Perfil"
        hdr_email  = "E-mail"
        hdr_senha  = "Senha"
        print(f"  {hdr_perfil:<28} {hdr_email:<36} {hdr_senha}")
        print(f"  {'-'*28} {'-'*36} {'-'*20}")
        for r in results:
            label = PERFIL_LABEL.get(r["perfil"], r["perfil"])
            print(f"  {label:<28} {r['email']:<36} {r['senha']}")

        # Lembrar do admin
        print(f"  {'Gestor Cartográfico (DSG)':<28} {'admin@eb.mil.br':<36} Admin@1234  ← admin")
        print(SEP)
        print(f"\n  \033[32m✓ {len(results)} usuários processados.\033[0m")
        print(f"  Acesse: {base_url.replace('/api/v1', '')}/\n")


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Cria usuários de cada nível hierárquico do SISGEO (CMP / COTER)."
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
        help="Pula usuários já cadastrados em vez de atualizar.",
    )
    args = parser.parse_args()
    run(args.base_url, args.dry_run, args.skip_existing)
