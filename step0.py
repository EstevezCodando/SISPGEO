#!/usr/bin/env python3
"""
step0.py — Configuração inicial do SisPGeo
===========================================
Gera e armazena as credenciais obrigatórias no .env antes de subir o sistema.

Funciona em Windows, Linux e macOS — usa apenas a biblioteca padrão do Python.

Uso:
    python step0.py          # Linux / macOS / Windows (Prompt / PowerShell)
    python3 step0.py         # Linux / macOS (alternativa)

O script:
  1. Cria o .env a partir do .env.example (se o .env ainda não existir)
  2. Gera SECRET_KEY com secrets.token_hex(32)
       → equivalente criptográfico de: openssl rand -hex 32
  3. Solicita DB_PASSWORD e ADMIN_PASSWORD interativamente
       → não sobrescreve valores já preenchidos
  4. Grava tudo no .env preservando comentários e variáveis existentes
"""

import getpass
import re
import secrets
import sys
from pathlib import Path

# ── Caminhos ─────────────────────────────────────────────────────────────────
ROOT        = Path(__file__).resolve().parent
ENV_FILE    = ROOT / ".env"
ENV_EXAMPLE = ROOT / ".env.example"

# Regex de complexidade — mesmas regras do backend (config.py)
_PASS_RE = re.compile(r'^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$')

# Valores padrão/inseguros que devem ser substituídos
_INSECURE_SECRETS = {
    "",
    "changeme_super_secret_key_minimum_32_chars",
    "_INSECURE_KEY",
}
_INSECURE_PASSWORDS = {
    "",
    "Admin@1234",
    "troque_por_senha_forte_aqui",
}


# ── Helpers de I/O ───────────────────────────────────────────────────────────

def _sep(msg: str = "") -> None:
    print()
    print("─" * 54)
    if msg:
        print(f"  {msg}")
        print("─" * 54)


def _ok(msg: str)   -> None: print(f"  ✓ {msg}")
def _warn(msg: str) -> None: print(f"  ⚠ {msg}")
def _err(msg: str)  -> None: print(f"  ✗ {msg}")


# ── Leitura / escrita do .env ────────────────────────────────────────────────

def _read_lines(path: Path) -> list[str]:
    if not path.exists():
        return []
    return path.read_text(encoding="utf-8").splitlines()


def _parse(lines: list[str]) -> dict[str, str]:
    """Retorna {CHAVE: valor} ignorando comentários e linhas em branco."""
    env: dict[str, str] = {}
    for line in lines:
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        key, _, val = s.partition("=")
        env[key.strip()] = val.strip()
    return env


def _write(path: Path, original: list[str], updates: dict[str, str]) -> None:
    """
    Aplica `updates` ao .env preservando comentários e ordem original.
    Variáveis novas (não presentes no original) são acrescentadas no final.
    """
    result: list[str] = []
    written: set[str] = set()

    for line in original:
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            result.append(line)
            continue
        key = s.split("=", 1)[0].strip()
        if key in updates:
            result.append(f"{key}={updates[key]}")
            written.add(key)
        else:
            result.append(line)

    # Variáveis que não existiam no arquivo original
    new_vars = {k: v for k, v in updates.items() if k not in written}
    if new_vars:
        result.append("")
        result.append("# ── Gerado por step0.py ──────────────────────────")
        for k, v in new_vars.items():
            result.append(f"{k}={v}")

    path.write_text("\n".join(result) + "\n", encoding="utf-8")


# ── Lógica de cada credencial ────────────────────────────────────────────────

def _ensure_secret_key(current: dict[str, str]) -> str | None:
    """Retorna novo valor ou None se já está correto."""
    val = current.get("SECRET_KEY", "")
    if val and val not in _INSECURE_SECRETS and len(val) >= 32:
        _ok("SECRET_KEY já definida — mantendo valor existente.")
        return None
    key = secrets.token_hex(32)   # 256 bits, hex → 64 chars
    _ok(f"SECRET_KEY gerada: {key[:16]}···{key[-8:]}  ({len(key)} chars)")
    return key


def _ask_password(label: str, validate_complexity: bool = False) -> str:
    """Solicita senha com confirmação e, opcionalmente, validação de complexidade."""
    while True:
        try:
            pwd = getpass.getpass(f"  {label}: ")
        except Exception:
            # Fallback para ambientes sem TTY (CI, pipe)
            pwd = input(f"  {label} (visível): ").strip()

        if not pwd:
            _err("A senha não pode ser vazia.")
            continue

        if validate_complexity and not _PASS_RE.match(pwd):
            _err("Requisitos: mín. 8 caracteres, maiúscula, minúscula, número e símbolo.")
            print("       Exemplo válido: MinhaSenh@2026")
            continue

        try:
            confirm = getpass.getpass("  Confirme a senha: ")
        except Exception:
            confirm = input("  Confirme (visível): ").strip()

        if pwd != confirm:
            _err("As senhas não conferem. Tente novamente.")
            continue

        return pwd


def _ensure_db_password(current: dict[str, str]) -> str | None:
    val = current.get("DB_PASSWORD", "")
    if val and val not in _INSECURE_PASSWORDS and len(val) >= 8:
        _ok("DB_PASSWORD já definida — mantendo valor existente.")
        return None
    print("  Defina a senha do PostgreSQL (mín. 8 caracteres).")
    pwd = _ask_password("DB_PASSWORD")
    _ok("DB_PASSWORD definida.")
    return pwd


def _ensure_admin_password(current: dict[str, str]) -> str | None:
    val = current.get("ADMIN_PASSWORD", "")
    if val and val not in _INSECURE_PASSWORDS and _PASS_RE.match(val):
        _ok("ADMIN_PASSWORD já definida — mantendo valor existente.")
        return None
    print("  Requisitos: mín. 8 chars | maiúscula | minúscula | número | símbolo.")
    print("  Exemplo válido: MinhaSenh@2026")
    pwd = _ask_password("ADMIN_PASSWORD", validate_complexity=True)
    _ok("ADMIN_PASSWORD definida.")
    return pwd


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    _sep("SisPGeo — Configuração inicial  (step0.py)")
    print(f"  Arquivo alvo: {ENV_FILE}")

    # 1. Garantir que .env existe
    if not ENV_FILE.exists():
        if ENV_EXAMPLE.exists():
            ENV_FILE.write_text(
                ENV_EXAMPLE.read_text(encoding="utf-8"), encoding="utf-8"
            )
            _ok(".env criado a partir de .env.example")
        else:
            ENV_FILE.write_text("", encoding="utf-8")
            _warn(".env.example não encontrado — .env criado vazio")
    else:
        _ok(".env já existe — valores existentes serão preservados")

    lines   = _read_lines(ENV_FILE)
    current = _parse(lines)
    updates: dict[str, str] = {}

    # 2. SECRET_KEY (geração automática)
    _sep("1/3 · SECRET_KEY  (chave de assinatura JWT)")
    v = _ensure_secret_key(current)
    if v:
        updates["SECRET_KEY"] = v

    # 3. DB_PASSWORD (interativo)
    _sep("2/3 · DB_PASSWORD  (senha do PostgreSQL)")
    v = _ensure_db_password(current)
    if v:
        updates["DB_PASSWORD"] = v

    # 4. ADMIN_PASSWORD (interativo + validação)
    _sep("3/3 · ADMIN_PASSWORD  (senha do usuário admin@eb.mil.br)")
    v = _ensure_admin_password(current)
    if v:
        updates["ADMIN_PASSWORD"] = v

    # 5. Gravar
    _sep()
    if updates:
        _write(ENV_FILE, lines, updates)
        _ok(f".env atualizado — variáveis gravadas: {', '.join(updates)}")
    else:
        _ok("Nenhuma alteração necessária — todas as credenciais já estavam configuradas.")

    print()
    print("  Próximo passo:")
    print("  ┌─────────────────────────────────────────────┐")
    print("  │  docker compose up --build -d               │")
    print("  └─────────────────────────────────────────────┘")
    print()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n  Operação cancelada pelo usuário.")
        sys.exit(1)
