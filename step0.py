#!/usr/bin/env python3
"""
step0.py — Gerador de credenciais iniciais do SisPGeo
======================================================
Gera SECRET_KEY, DB_PASSWORD e ADMIN_PASSWORD e salva em 'senhas_fortes.txt'
com instruções de onde colar cada valor.

NÃO altera o .env nem o docker-compose.yml diretamente.

Uso:
    python step0.py        # Windows (Prompt / PowerShell)
    python3 step0.py       # Linux / macOS
"""

import getpass
import re
import secrets
import sys
from datetime import datetime
from pathlib import Path

# ── Caminhos ─────────────────────────────────────────────────────────────────
ROOT        = Path(__file__).resolve().parent
OUTPUT_FILE = ROOT / "senhas_fortes.txt"

# Regex de complexidade — mesmas regras do backend (config.py)
_PASS_RE = re.compile(r'^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$')


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sep(msg: str = "") -> None:
    print()
    if msg:
        print(f"  ┌─ {msg}")
    else:
        print("  " + "─" * 52)


def _ok(msg: str)   -> None: print(f"  ✓ {msg}")
def _err(msg: str)  -> None: print(f"  ✗ {msg}")


def _ask_password(label: str, validate_complexity: bool = False) -> str:
    """Solicita senha com confirmação e, opcionalmente, validação de complexidade."""
    while True:
        try:
            pwd = getpass.getpass(f"  {label}: ")
        except Exception:
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


# ── Geração do arquivo de saída ───────────────────────────────────────────────

def _build_output(secret_key: str, db_password: str, admin_password: str) -> str:
    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    return f"""\
╔══════════════════════════════════════════════════════════════╗
║           SisPGeo — Credenciais Geradas  ({now})       ║
╚══════════════════════════════════════════════════════════════╝

⚠  ATENÇÃO
   • Não versione este arquivo no git (está no .gitignore)
   • Delete este arquivo após configurar o sistema
   • Nunca compartilhe estas informações

──────────────────────────────────────────────────────────────
 PASSO 1 — Edite o arquivo  .env  na raiz do projeto
──────────────────────────────────────────────────────────────

 Localize as linhas abaixo no .env e substitua pelos valores:

   SECRET_KEY={secret_key}
   DB_PASSWORD={db_password}
   ADMIN_PASSWORD={admin_password}

 Caso as linhas não existam, adicione-as ao final do arquivo.

──────────────────────────────────────────────────────────────
 PASSO 2 — O docker-compose.yml NÃO precisa ser editado
──────────────────────────────────────────────────────────────

 O docker-compose.yml já lê as variáveis automaticamente do .env:

   SECRET_KEY:     lido via ${{SECRET_KEY}}
   DB_PASSWORD:    lido via ${{DB_PASSWORD}}
   ADMIN_PASSWORD: lido via ${{ADMIN_PASSWORD}}

 Nenhuma alteração manual no docker-compose.yml é necessária.

──────────────────────────────────────────────────────────────
 PASSO 3 — Suba o sistema
──────────────────────────────────────────────────────────────

   docker compose up --build -d

──────────────────────────────────────────────────────────────
 PASSO 4 — Delete este arquivo
──────────────────────────────────────────────────────────────

 Após confirmar que o sistema subiu corretamente, delete:

   Windows:  del senhas_fortes.txt
   Linux:    rm senhas_fortes.txt

══════════════════════════════════════════════════════════════
"""


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print()
    print("  ╔══════════════════════════════════════════════════╗")
    print("  ║   SisPGeo — Gerador de Credenciais (step0.py)  ║")
    print("  ╚══════════════════════════════════════════════════╝")
    print()
    print("  As credenciais geradas serão salvas em 'senhas_fortes.txt'.")
    print("  O .env e o docker-compose.yml NÃO serão alterados.")

    # 1. SECRET_KEY — geração automática
    _sep("1/3  SECRET_KEY  (gerada automaticamente)")
    secret_key = secrets.token_hex(32)   # 256 bits → 64 chars hex
    _ok(f"Gerada: {secret_key[:16]}···{secret_key[-8:]}  ({len(secret_key)} chars)")

    # 2. DB_PASSWORD — interativo
    _sep("2/3  DB_PASSWORD  (senha do PostgreSQL)")
    print("  Defina uma senha para o banco de dados (mín. 8 caracteres).")
    db_password = _ask_password("DB_PASSWORD")
    _ok("Recebida.")

    # 3. ADMIN_PASSWORD — interativo + validação
    _sep("3/3  ADMIN_PASSWORD  (senha do usuário admin@eb.mil.br)")
    print("  Requisitos: mín. 8 chars | maiúscula | minúscula | número | símbolo")
    print("  Exemplo válido: MinhaSenh@2026")
    admin_password = _ask_password("ADMIN_PASSWORD", validate_complexity=True)
    _ok("Recebida.")

    # Escrever senhas_fortes.txt
    _sep()
    content = _build_output(secret_key, db_password, admin_password)
    OUTPUT_FILE.write_text(content, encoding="utf-8")
    _ok(f"Arquivo criado: {OUTPUT_FILE}")

    print()
    print("  Próximos passos:")
    print("  ┌────────────────────────────────────────────────────┐")
    print("  │  1. Abra 'senhas_fortes.txt' e siga as instruções  │")
    print("  │  2. docker compose up --build -d                   │")
    print("  │  3. Delete 'senhas_fortes.txt'                     │")
    print("  └────────────────────────────────────────────────────┘")
    print()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n  Operação cancelada pelo usuário.")
        sys.exit(1)
