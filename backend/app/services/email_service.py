"""
Serviço de envio de e-mails do SisPGeo.

Roteamento (em ordem de prioridade):
  1. RESEND_API_KEY configurado → usa Resend.
  2. SMTP_USER + SMTP_PASSWORD configurados → usa Zimbra via SMTP (STARTTLS 587).
  3. Sem credenciais (dev sem SMTP) → Mailpit (captura local em http://localhost:8025).

O valor de ENV não interfere mais no roteamento - as credenciais é que definem
o canal. Isso permite usar o Zimbra real mesmo em ambiente de desenvolvimento,
bastando preencher SMTP_USER e SMTP_PASSWORD no .env.

Falhas de envio são registradas em log mas **não** propagadas ao chamador,
para evitar que um problema de e-mail interrompa o fluxo principal do sistema.
"""

import asyncio
import logging

from app.config import settings

logger = logging.getLogger(__name__)


# ── Resend ────────────────────────────────────────────────────────────────────

async def _send_via_resend(to: str, subject: str, html_body: str) -> None:
    """Envia via Resend SDK (produção com domínio verificado)."""
    import resend

    resend.api_key = settings.RESEND_API_KEY
    params: resend.Emails.SendParams = {
        "from": settings.RESEND_FROM,
        "to": [to],
        "subject": subject,
        "html": html_body,
    }
    response = await asyncio.to_thread(resend.Emails.send, params)
    logger.info("Email enviado via Resend para %s | id=%s | subject=%s", to, response.get("id"), subject)


# ── SMTP genérico (Zimbra em produção / Mailpit em dev) ───────────────────────

async def _send_via_smtp(
    to: str,
    subject: str,
    html_body: str,
    *,
    host: str,
    port: int,
    use_tls: bool,
    username: str = "",
    password: str = "",
) -> None:
    """Envia via SMTP com aiosmtplib. Suporta STARTTLS (porta 587) e SSL direto (465)."""
    import aiosmtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    send_kwargs: dict = {"hostname": host, "port": port, "use_tls": use_tls}

    if username and password:
        send_kwargs["username"] = username
        send_kwargs["password"] = password
        if not use_tls and port == 587:
            send_kwargs["start_tls"] = True

    await aiosmtplib.send(msg, **send_kwargs)
    logger.info("Email enviado via SMTP (%s:%d) para %s: %s", host, port, to, subject)


# ── Ponto de entrada público ──────────────────────────────────────────────────

async def send_email(to: str, subject: str, html_body: str) -> None:
    """Envia um e-mail HTML de forma assíncrona.

    Roteamento (em ordem de prioridade):
      1. RESEND_API_KEY configurado → Resend
      2. SMTP_USER + SMTP_PASSWORD configurados → Zimbra via SMTP
      3. Sem credenciais → Mailpit (captura local, sem entrega real)

    Args:
        to:        Endereço do destinatário.
        subject:   Assunto da mensagem.
        html_body: Corpo em HTML.
    """
    try:
        if settings.RESEND_API_KEY:
            await _send_via_resend(to, subject, html_body)

        elif settings.SMTP_USER and settings.SMTP_PASSWORD:
            logger.debug("Email → Zimbra (%s:%d) para %s", settings.SMTP_HOST, settings.SMTP_PORT, to)
            await _send_via_smtp(
                to, subject, html_body,
                host=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                use_tls=settings.SMTP_TLS,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
            )

        else:
            logger.debug("Sem credenciais SMTP → Mailpit (%s:%d) para %s", settings.MAILPIT_HOST, settings.MAILPIT_PORT, to)
            await _send_via_smtp(
                to, subject, html_body,
                host=settings.MAILPIT_HOST,
                port=settings.MAILPIT_PORT,
                use_tls=False,
            )

    except Exception as exc:
        logger.error("Falha ao enviar email para %s: %s", to, exc)
