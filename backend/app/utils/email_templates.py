from app.config import settings


def _base(title: str, body: str) -> str:
    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>{title}</title></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
  <div style="background:#1a3a5c;padding:20px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px">Sistema COTER - DSG/EB</h1>
  </div>
  <div style="padding:30px">
    {body}
  </div>
  <div style="background:#f4f4f4;padding:15px;text-align:center;font-size:12px;color:#666">
    Exército Brasileiro - Diretoria de Serviço Geográfico<br>
    Este é um email automático. Não responda.
  </div>
</div>
</body>
</html>
"""


def cadastro_recebido(nome: str, email: str) -> tuple[str, str]:
    """E-mail de boas-vindas enviado imediatamente após o cadastro.

    Não exige confirmação de link — o acesso é liberado pelo administrador.
    """
    subject = "SISGEO — Cadastro recebido"
    body = f"""
<h2>Olá, {nome}!</h2>
<p>Seu cadastro no <strong>SISGEO — Sistema Integrado de Solicitações de Geoinformação</strong>
foi recebido com sucesso.</p>
<table style="margin:24px 0;border-collapse:collapse;width:100%">
  <tr>
    <td style="padding:8px 0;color:#666;width:120px"><strong>Email:</strong></td>
    <td style="padding:8px 0">{email}</td>
  </tr>
  <tr>
    <td style="padding:8px 0;color:#666"><strong>Status:</strong></td>
    <td style="padding:8px 0;color:#e67e00"><strong>Aguardando ativação pelo administrador</strong></td>
  </tr>
</table>
<p>Assim que o administrador aprovar o seu acesso, você poderá fazer login normalmente em:</p>
<p style="text-align:center;margin:24px 0">
  <a href="{settings.FRONTEND_URL}/login"
     style="background:#059669;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600">
    Acessar o SISGEO
  </a>
</p>
<p style="color:#888;font-size:13px">Caso não tenha realizado este cadastro, ignore este e-mail.</p>
"""
    return subject, _base(subject, body)


def confirmacao_email(nome: str, token: str) -> tuple[str, str]:
    """Mantido por compatibilidade — não é mais utilizado no fluxo principal."""
    link = f"{settings.FRONTEND_URL}/confirmar-email/{token}"
    subject = "SISGEO — Confirme seu cadastro"
    body = f"""
<h2>Olá, {nome}!</h2>
<p>Clique no botão abaixo para confirmar seu email:</p>
<p style="text-align:center;margin:30px 0">
  <a href="{link}" style="background:#059669;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block">
    Confirmar Email
  </a>
</p>
<p><strong>Este link expira em 24 horas.</strong></p>
"""
    return subject, _base(subject, body)


def reset_senha(nome: str, token: str) -> tuple[str, str]:
    link = f"{settings.FRONTEND_URL}/redefinir-senha/{token}"
    subject = "COTER - Redefinição de senha"
    body = f"""
<h2>Olá, {nome}!</h2>
<p>Recebemos uma solicitação de redefinição de senha para sua conta.</p>
<p style="text-align:center;margin:30px 0">
  <a href="{link}" style="background:#1a3a5c;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block">
    Redefinir Senha
  </a>
</p>
<p><strong>Este link expira em 1 hora.</strong></p>
<p>Se não solicitou, ignore este email.</p>
"""
    return subject, _base(subject, body)


def pedido_submetido(nome: str, pedido_id: int, operacao: str) -> tuple[str, str]:
    subject = f"COTER - Pedido #{pedido_id} recebido"
    body = f"""
<h2>Olá, {nome}!</h2>
<p>Seu pedido <strong>#{pedido_id}</strong> da operação <strong>{operacao}</strong> foi submetido com sucesso.</p>
<p>Ele está aguardando análise do Gestor Demandante.</p>
<p>Você pode acompanhar o status em: <a href="{settings.FRONTEND_URL}/meus-pedidos">{settings.FRONTEND_URL}/meus-pedidos</a></p>
"""
    return subject, _base(subject, body)


def pedido_aprovado(nome: str, pedido_id: int) -> tuple[str, str]:
    subject = f"COTER - Pedido #{pedido_id} aprovado"
    body = f"""
<h2>Olá, {nome}!</h2>
<p>Seu pedido <strong>#{pedido_id}</strong> foi <strong style="color:green">aprovado</strong> pelo DSG.</p>
<p>Acompanhe a produção em: <a href="{settings.FRONTEND_URL}/meus-pedidos">{settings.FRONTEND_URL}/meus-pedidos</a></p>
"""
    return subject, _base(subject, body)


def pedido_reprovado(nome: str, pedido_id: int, motivo: str) -> tuple[str, str]:
    subject = f"COTER - Pedido #{pedido_id} não aprovado"
    body = f"""
<h2>Olá, {nome}!</h2>
<p>Seu pedido <strong>#{pedido_id}</strong> <strong style="color:red">não foi aprovado</strong>.</p>
<p><strong>Motivo:</strong> {motivo}</p>
<p>Em caso de dúvidas, entre em contato com o seu Gestor Demandante.</p>
"""
    return subject, _base(subject, body)


def pedido_produzido(nome: str, pedido_id: int, link_bdgex: str | None) -> tuple[str, str]:
    subject = f"COTER - Pedido #{pedido_id} produzido e disponível no BDGEx"
    link_html = (
        f'<p style="text-align:center;margin:24px 0">'
        f'<a href="{link_bdgex}" style="background:#1a3a5c;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block">'
        f'Acessar dados no BDGEx</a></p>'
        if link_bdgex else
        '<p>O link de acesso aos dados será fornecido pelo CGEO em breve.</p>'
    )
    body = f"""
<h2>Olá, {nome}!</h2>
<p>Seu pedido <strong>#{pedido_id}</strong> foi <strong style="color:green">concluído</strong> e os dados estão disponíveis no BDGEx.</p>
{link_html}
<p>Acompanhe também em: <a href="{settings.FRONTEND_URL}/meus-pedidos">{settings.FRONTEND_URL}/meus-pedidos</a></p>
"""
    return subject, _base(subject, body)


def pedido_transferido(nome_novo: str, nome_anterior: str, count: int) -> tuple[str, str]:
    subject = f"COTER - {count} pedido(s) transferidos para você"
    body = f"""
<h2>Olá, {nome_novo}!</h2>
<p>O usuário <strong>{nome_anterior}</strong> transferiu <strong>{count} pedido(s)</strong> para a sua responsabilidade.</p>
<p>Acesse o sistema para visualizar: <a href="{settings.FRONTEND_URL}/meus-pedidos">{settings.FRONTEND_URL}/meus-pedidos</a></p>
"""
    return subject, _base(subject, body)


def notificar_gestor(nome_gestor: str, nome_usuario: str, pedido_id: int, om: str) -> tuple[str, str]:
    subject = f"COTER - Novo pedido #{pedido_id} aguardando revisão"
    body = f"""
<h2>Olá, {nome_gestor}!</h2>
<p>O usuário <strong>{nome_usuario}</strong> da OM <strong>{om}</strong> submeteu o pedido <strong>#{pedido_id}</strong> para análise.</p>
<p>Acesse o sistema para revisar: <a href="{settings.FRONTEND_URL}/gestor/pedidos">{settings.FRONTEND_URL}/gestor/pedidos</a></p>
"""
    return subject, _base(subject, body)
