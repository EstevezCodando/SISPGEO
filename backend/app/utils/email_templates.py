from app.config import settings

# ── Prazos de expiração ───────────────────────────────────────────────────────
# Devem coincidir com as constantes homônimas em app/services/auth_service.py.
# Centralizar aqui evita importação circular (auth_service importa este módulo).
_RESET_TOKEN_HOURS: int = 1    # RESET_TOKEN_EXPIRY_HOURS
_CONFIRM_TOKEN_HOURS: int = 24  # EMAIL_CONFIRM_TOKEN_EXPIRY_HOURS

# ── Paleta Militar Oliva ──────────────────────────────────────────────────────
# Fundo geral:   #eae8de  (pergaminho/areia)
# Cabeçalho:     #3a4c22  (verde oliva escuro — uniforme)
# Destaque:      #5a7030  (oliva médio)
# Botão CTA:     #4a6028  (oliva forte)
# Rodapé:        #d6d2c4  (areia clara)
# Borda tabela:  #b0aa90
# ─────────────────────────────────────────────────────────────────────────────

# Estilo padrão para parágrafos de corpo — alinhamento justificado
_P = "margin:0 0 16px 0;color:#5a5a48;font-size:13px;line-height:1.7;text-align:justify"
_P_SMALL = "margin:0;color:#a0a090;font-size:11px;font-style:italic;text-align:justify"


def _base(title: str, body: str) -> str:
    return f"""
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#eae8de;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eae8de;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:4px;
                    overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.18);
                    border:1px solid #b0aa90">

        <!-- Cabeçalho -->
        <tr>
          <td style="background:#3a4c22;padding:0">
            <!-- faixa dourada -->
            <div style="height:4px;background:linear-gradient(90deg,#8b7d3a 0%,#c9b86c 50%,#8b7d3a 100%)"></div>
            <div style="padding:24px 32px 20px 32px;text-align:center">
              <p style="margin:0 0 2px 0;color:#c9b86c;font-size:10px;
                        letter-spacing:3px;text-transform:uppercase;font-weight:700">
                Diretoria de Serviço Geográfico
              </p>
              <h1 style="margin:4px 0 2px 0;color:#e8e4d0;font-size:17px;
                         font-weight:700;letter-spacing:0.8px;text-transform:uppercase">
                SisPGeo
              </h1>
              <p style="margin:0;color:#a0b070;font-size:11px;letter-spacing:0.5px">
                Sistema de Pedidos de Geoinformação
              </p>
              <p style="margin:6px 0 0 0;color:#8a9e60;font-size:10px">
                Exército Brasileiro · DSG · Brasília/DF
              </p>
            </div>
            <!-- faixa dourada inferior -->
            <div style="height:2px;background:linear-gradient(90deg,#8b7d3a 0%,#c9b86c 50%,#8b7d3a 100%)"></div>
          </td>
        </tr>

        <!-- Corpo -->
        <tr>
          <td style="padding:36px 40px 28px 40px;background:#ffffff">
            {body}
          </td>
        </tr>

        <!-- Rodapé -->
        <tr>
          <td style="background:#e8e4d6;border-top:2px solid #b0aa90;padding:18px 40px;text-align:center">
            <p style="margin:0 0 4px 0;color:#6b6550;font-size:10px;
                      letter-spacing:1px;text-transform:uppercase;font-weight:700">
              Comunicação Automática de Sistema
            </p>
            <p style="margin:0;color:#8a8470;font-size:11px;line-height:1.7">
              Não responda a este e-mail — mensagens não são monitoradas.<br>
              Exército Brasileiro · Diretoria de Serviço Geográfico · Brasília/DF
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def _btn(href: str, label: str, color: str = "#4a6028") -> str:
    return (
        f'<p style="text-align:center;margin:28px 0">'
        f'<a href="{href}" style="background:{color};color:#e8e4d0;padding:13px 36px;'
        f'text-decoration:none;border-radius:3px;display:inline-block;font-weight:700;'
        f'font-size:14px;letter-spacing:1px;text-transform:uppercase;'
        f'border:1px solid rgba(0,0,0,0.25);'
        f'box-shadow:0 2px 6px rgba(0,0,0,0.3)">{label}</a></p>'
    )


def _info_row(label: str, value: str) -> str:
    return (
        f'<tr>'
        f'<td style="padding:8px 12px;color:#4a4838;font-size:12px;width:150px;'
        f'background:#f0ede2;border:1px solid #c8c4b0;font-weight:700;'
        f'letter-spacing:0.3px;text-transform:uppercase">{label}</td>'
        f'<td style="padding:8px 12px;color:#2a2820;font-size:13px;'
        f'background:#faf9f4;border:1px solid #c8c4b0">{value}</td>'
        f'</tr>'
    )


def _divider() -> str:
    return (
        '<tr><td colspan="2" style="padding:0">'
        '<hr style="border:none;border-top:1px solid #d4d0c0;margin:0">'
        '</td></tr>'
    )


# ── Ativação de conta (e-mail de confirmação) ─────────────────────────────────

def ativacao_conta(nome: str, token: str) -> tuple[str, str]:
    """Enviado imediatamente após o cadastro — contém link de ativação único."""
    link = f"{settings.FRONTEND_URL}/ativar/{token}"
    link_ajuda = f"{settings.FRONTEND_URL}/ajuda"
    validade_h = _CONFIRM_TOKEN_HOURS
    subject = "SisPGeo — Ative sua conta de acesso"
    body = f"""
<h2 style="margin:0 0 4px 0;color:#3a4c22;font-size:18px;font-weight:700;
           letter-spacing:0.3px">Prezado(a) {nome},</h2>
<p style="{_P};border-bottom:1px solid #e0ddd0;padding-bottom:16px">
  Seu cadastro no <strong>SisPGeo</strong> foi registrado com sucesso.
  Clique no botão abaixo para ativar sua conta. O link é válido por
  <strong>{validade_h} hora{'s' if validade_h != 1 else ''}</strong>.
</p>

{_btn(link, "▶ Ativar Minha Conta")}

<table cellpadding="0" cellspacing="0"
       style="width:100%;border-collapse:collapse;margin-bottom:24px;
              border:1px solid #c8c4b0">
  {_info_row("Validade do link", f'<strong>{validade_h} hora{"s" if validade_h != 1 else ""}</strong> a partir deste envio')}
  {_info_row("Status", '<span style="color:#8b6914;font-weight:700">● Aguardando ativação de e-mail</span>')}
</table>

<!-- Sobre o sistema -->
<div style="background:#f5f8f0;border:1px solid #b8c8a0;border-radius:3px;
            padding:16px 20px;margin-bottom:20px">
  <p style="margin:0 0 8px 0;color:#3a4c22;font-size:12px;font-weight:700;
            text-transform:uppercase;letter-spacing:0.8px">
    Sobre o SisPGeo
  </p>
  <p style="{_P};margin-bottom:10px">
    O SisPGeo é o sistema oficial da <strong>Diretoria de Serviço Geográfico</strong>
    para solicitação de produtos de geoinformação do Exército Brasileiro.
    Por meio do sistema você pode solicitar:
  </p>
  <table cellpadding="0" cellspacing="0" style="width:100%">
    <tr>
      <td style="padding:3px 0;color:#4a5a38;font-size:12px;width:50%;vertical-align:top">
        ▸ Cartas Topográficas
      </td>
      <td style="padding:3px 0;color:#4a5a38;font-size:12px;width:50%;vertical-align:top">
        ▸ Cartas Ortoimagem
      </td>
    </tr>
    <tr>
      <td style="padding:3px 0;color:#4a5a38;font-size:12px;vertical-align:top">
        ▸ Impressão de Cartas
      </td>
      <td style="padding:3px 0;color:#4a5a38;font-size:12px;vertical-align:top">
        ▸ Ortoimagens e MDT/MDS
      </td>
    </tr>
    <tr>
      <td style="padding:3px 0;color:#4a5a38;font-size:12px;vertical-align:top">
        ▸ Conjunto de Dados Geoespaciais Vetoriais
      </td>
      <td style="padding:3px 0;color:#4a5a38;font-size:12px;vertical-align:top">
        ▸ Produtos especiais sob demanda
      </td>
    </tr>
  </table>
</div>

<!-- Dúvidas -->
<div style="background:#f0ede2;border-left:4px solid #6b8040;
            padding:12px 16px;border-radius:0 3px 3px 0;margin-bottom:20px">
  <p style="margin:0 0 4px 0;color:#3a4c22;font-size:12px;font-weight:700;
            text-transform:uppercase;letter-spacing:0.5px">Dúvidas?</p>
  <p style="margin:0;color:#4a5a38;font-size:13px;line-height:1.6;text-align:justify">
    Acesse o painel de ajuda do sistema para conhecer os tipos de produtos,
    fluxo de solicitação e perguntas frequentes:<br>
    <a href="{link_ajuda}" style="color:#3a6020;font-weight:700">{link_ajuda}</a>
  </p>
</div>

<p style="margin:0 0 6px 0;color:#6a6858;font-size:11px">
  Caso o botão não funcione, copie e cole o link abaixo no navegador:
</p>
<p style="margin:0 0 20px 0;word-break:break-all;background:#f0ede2;
          padding:8px 12px;border-radius:3px;border:1px solid #c8c4b0">
  <a href="{link}" style="color:#3a6020;font-size:11px;font-family:monospace">{link}</a>
</p>

<p style="{_P_SMALL}">
  Se você não realizou este cadastro, desconsidere esta mensagem.
  Nenhuma ação é necessária.
</p>
"""
    return subject, _base(subject, body)


# ── Cadastro recebido (informativo — legado) ──────────────────────────────────

def cadastro_recebido(nome: str, email: str) -> tuple[str, str]:
    """Legado — mantido para compatibilidade. Usar ativacao_conta() no novo fluxo."""
    subject = "SisPGeo — Cadastro recebido"
    body = f"""
<h2 style="margin:0 0 6px 0;color:#3a4c22;font-size:18px;font-weight:700">
  Cadastro recebido, {nome}.</h2>
<p style="{_P}">
  Seu pedido de acesso ao <strong>SisPGeo</strong> foi registrado.
  Um administrador irá analisar e ativar sua conta em até <strong>2 dias úteis</strong>.
</p>

<table cellpadding="0" cellspacing="0"
       style="width:100%;border-collapse:collapse;margin-bottom:24px;
              border:1px solid #c8c4b0">
  {_info_row("E-mail", email)}
  {_info_row("Status", '<span style="color:#8b6914;font-weight:700">● Aguardando ativação</span>')}
</table>

{_btn(f"{settings.FRONTEND_URL}/login", "Acessar o SisPGeo")}

<p style="{_P_SMALL}">
  Caso não tenha realizado este cadastro, desconsidere esta mensagem.
</p>
"""
    return subject, _base(subject, body)


# ── Conta ativada pelo administrador ─────────────────────────────────────────

def conta_ativada(nome: str, email: str) -> tuple[str, str]:
    subject = "SisPGeo — Acesso autorizado"
    body = f"""
<h2 style="margin:0 0 6px 0;color:#3a4c22;font-size:18px;font-weight:700">
  Acesso autorizado, {nome}.</h2>
<p style="{_P};border-bottom:1px solid #e0ddd0;padding-bottom:16px">
  Sua conta no <strong>SisPGeo</strong> foi
  <strong style="color:#3a7030">aprovada e ativada</strong> pelo administrador do sistema.
  Você já pode realizar login e solicitar produtos de geoinformação.
</p>

<table cellpadding="0" cellspacing="0"
       style="width:100%;border-collapse:collapse;margin-bottom:24px;
              border:1px solid #c8c4b0">
  {_info_row("E-mail de acesso", email)}
  {_info_row("Status", '<span style="color:#3a7030;font-weight:700">✓ Conta ativa</span>')}
</table>

<div style="background:#f0f8e8;border-left:4px solid #5a7030;
            padding:14px 16px;border-radius:0 3px 3px 0;margin-bottom:24px">
  <p style="margin:0 0 6px 0;color:#2a4010;font-size:12px;font-weight:700;
            text-transform:uppercase;letter-spacing:0.5px">Missão disponível</p>
  <p style="margin:0;color:#3a5020;font-size:13px;line-height:1.6;text-align:justify">
    Você pode agora submeter pedidos de produtos cartográficos, acompanhar
    o status das solicitações e consultar o histórico da sua OM.
  </p>
</div>

{_btn(f"{settings.FRONTEND_URL}/login", "▶ Acessar o SisPGeo")}

<p style="{_P_SMALL}">
  Em caso de dúvidas, entre em contato com o administrador do sistema.
</p>
"""
    return subject, _base(subject, body)


# ── Redefinição de senha ──────────────────────────────────────────────────────

def reset_senha(nome: str, token: str) -> tuple[str, str]:
    link = f"{settings.FRONTEND_URL}/redefinir-senha/{token}"
    validade_h = _RESET_TOKEN_HOURS
    subject = "SisPGeo — Redefinição de senha solicitada"
    body = f"""
<h2 style="margin:0 0 6px 0;color:#3a4c22;font-size:18px;font-weight:700">
  Redefinição de senha — {nome}.</h2>
<p style="{_P};border-bottom:1px solid #e0ddd0;padding-bottom:16px">
  Recebemos uma solicitação de <strong>redefinição de senha</strong> para esta conta no
  <strong>SisPGeo</strong>. Clique no botão abaixo para definir uma nova senha de acesso.
</p>

{_btn(link, "▶ Redefinir Minha Senha", color="#6b4020")}

<div style="background:#fdf6e8;border-left:4px solid #8b7d3a;
            padding:14px 16px;border-radius:0 3px 3px 0;margin-bottom:20px">
  <p style="margin:0 0 6px 0;color:#4a3c10;font-size:12px;font-weight:700;
            text-transform:uppercase;letter-spacing:0.5px">⚠ Atenção</p>
  <p style="margin:0;color:#5a4c1a;font-size:13px;line-height:1.6;text-align:justify">
    Este link é de <strong>uso único</strong> e expira em
    <strong>{validade_h} hora{'s' if validade_h != 1 else ''}</strong>.
    Após expirar, será necessário solicitar um novo link.
  </p>
</div>

<p style="margin:0 0 4px 0;color:#6a6858;font-size:11px">
  Ou copie e cole o link no navegador:
</p>
<p style="margin:0 0 20px 0;word-break:break-all;background:#f0ede2;
          padding:8px 12px;border-radius:3px;border:1px solid #c8c4b0">
  <a href="{link}" style="color:#3a6020;font-size:11px;font-family:monospace">{link}</a>
</p>

<p style="{_P_SMALL}">
  Se você não solicitou a redefinição, desconsidere esta mensagem.
  Sua senha permanece inalterada.
</p>
"""
    return subject, _base(subject, body)


# ── Confirmação de e-mail (alias legado) ─────────────────────────────────────

def confirmacao_email(nome: str, token: str) -> tuple[str, str]:
    """Alias legado — delega para ativacao_conta."""
    return ativacao_conta(nome, token)


# ── Notificações de pedidos ───────────────────────────────────────────────────

def pedido_submetido(nome: str, pedido_id: int, operacao: str) -> tuple[str, str]:
    subject = f"SisPGeo — Pedido #{pedido_id} recebido"
    body = f"""
<h2 style="margin:0 0 12px 0;color:#3a4c22;font-size:18px;font-weight:700">
  Pedido #{pedido_id} registrado.</h2>
<p style="{_P}">
  {nome}, seu pedido <strong>#{pedido_id}</strong> referente a
  <strong>{operacao}</strong> foi submetido e aguarda análise do Gestor Demandante.
</p>
{_btn(f"{settings.FRONTEND_URL}/meus-pedidos", "▶ Acompanhar Pedido")}
"""
    return subject, _base(subject, body)


def pedido_aprovado(nome: str, pedido_id: int) -> tuple[str, str]:
    subject = f"SisPGeo — Pedido #{pedido_id} aprovado"
    body = f"""
<h2 style="margin:0 0 12px 0;color:#3a4c22;font-size:18px;font-weight:700">
  Pedido #{pedido_id} aprovado.</h2>
<p style="{_P}">
  {nome}, seu pedido <strong>#{pedido_id}</strong> foi
  <strong style="color:#3a7030">aprovado pelo DSG</strong> e está em produção.
</p>
{_btn(f"{settings.FRONTEND_URL}/meus-pedidos", "▶ Ver Status do Pedido")}
"""
    return subject, _base(subject, body)


def pedido_reprovado(nome: str, pedido_id: int, motivo: str) -> tuple[str, str]:
    subject = f"SisPGeo — Pedido #{pedido_id} não aprovado"
    body = f"""
<h2 style="margin:0 0 12px 0;color:#3a4c22;font-size:18px;font-weight:700">
  Pedido #{pedido_id} — não aprovado.</h2>
<p style="{_P}">
  {nome}, seu pedido <strong>#{pedido_id}</strong>
  <strong style="color:#8b2020">não foi aprovado</strong>.
</p>
<div style="background:#fdf2f2;border-left:4px solid #8b2020;
            padding:14px 16px;border-radius:0 3px 3px 0;margin-bottom:20px">
  <p style="margin:0 0 4px 0;color:#5a1010;font-size:12px;font-weight:700;
            text-transform:uppercase;letter-spacing:0.5px">Motivo</p>
  <p style="margin:0;color:#6b2020;font-size:13px;text-align:justify">{motivo}</p>
</div>
<p style="{_P}">
  Em caso de dúvidas, entre em contato com o Gestor Demandante.
</p>
{_btn(f"{settings.FRONTEND_URL}/meus-pedidos", "▶ Ver Meus Pedidos")}
"""
    return subject, _base(subject, body)


def pedido_produzido(nome: str, pedido_id: int, link_bdgex: str | None) -> tuple[str, str]:
    subject = f"SisPGeo — Pedido #{pedido_id} disponível no BDGEx"
    link_html = (
        _btn(link_bdgex, "▶ Acessar Dados no BDGEx")
        if link_bdgex else
        '<p style="color:#5a5a48;font-size:13px;text-align:center">O link de acesso será fornecido pelo CGEO em breve.</p>'
    )
    body = f"""
<h2 style="margin:0 0 12px 0;color:#3a4c22;font-size:18px;font-weight:700">
  Pedido #{pedido_id} — produção concluída.</h2>
<p style="{_P}">
  {nome}, seu pedido <strong>#{pedido_id}</strong> foi
  <strong style="color:#3a7030">concluído</strong> e os dados estão disponíveis no BDGEx.
</p>
{link_html}
{_btn(f"{settings.FRONTEND_URL}/meus-pedidos", "▶ Ver Meus Pedidos", color="#5a6848")}
"""
    return subject, _base(subject, body)


def pedido_transferido(nome_novo: str, nome_anterior: str, count: int) -> tuple[str, str]:
    subject = f"SisPGeo — {count} pedido(s) transferidos para você"
    body = f"""
<h2 style="margin:0 0 12px 0;color:#3a4c22;font-size:18px;font-weight:700">
  Transferência de pedidos.</h2>
<p style="{_P}">
  {nome_novo}, o usuário <strong>{nome_anterior}</strong> transferiu
  <strong>{count} pedido(s)</strong> para sua responsabilidade.
</p>
{_btn(f"{settings.FRONTEND_URL}/meus-pedidos", "▶ Ver Pedidos Transferidos")}
"""
    return subject, _base(subject, body)


def notificar_gestor(nome_gestor: str, nome_usuario: str, pedido_id: int, om: str) -> tuple[str, str]:
    subject = f"SisPGeo — Pedido #{pedido_id} aguardando revisão"
    body = f"""
<h2 style="margin:0 0 12px 0;color:#3a4c22;font-size:18px;font-weight:700">
  Novo pedido aguardando revisão.</h2>
<p style="{_P}">
  {nome_gestor}, o usuário <strong>{nome_usuario}</strong> da OM <strong>{om}</strong>
  submeteu o pedido <strong>#{pedido_id}</strong> para análise.
</p>
{_btn(f"{settings.FRONTEND_URL}/gestor/pedidos", "▶ Revisar Pedido")}
"""
    return subject, _base(subject, body)
