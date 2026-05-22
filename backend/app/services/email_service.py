"""
Serviço de envio de e-mails do SisPGeo.

Prioridade:
  1. Resend (RESEND_API_KEY definido) — recomendado, entrega real garantida.
  2. SMTP via aiosmtplib (fallback legado — Mailpit em dev, relay EB em produção).

Falhas de envio são registradas em log mas **não** propagadas ao chamador,
para evitar que um problema de e-mail interrompa o fluxo principal do sistema.
"""

import asyncio
import logging

from app.config import settings

logger = logging.getLogger(__name__)


# ── Resend ────────────────────────────────────────────────────────────────────

async def _send_via_resend(to: str, subject: str, html_body: str) -> None:
    """Envia via Resend SDK (síncrono internamente → executado em thread)."""
    import resend  # importação lazy — só carrega se RESEND_API_KEY definido

    resend.api_key = settings.RESEND_API_KEY

    params: resend.Emails.SendParams = {
        "from": settings.RESEND_FROM,
        "to": [to],
        "subject": subject,
        "html": html_body,
    }

    # SDK do Resend é síncrono; usamos to_thread para não bloquear o event loop
    response = await asyncio.to_thread(resend.Emails.send, params)
    logger.info("Email enviado via Resend para %s | id=%s | subject=%s", to, response.get("id"), subject)


# ── SMTP legado (aiosmtplib) ──────────────────────────────────────────────────

async def _send_via_smtp(to: str, subject: str, html_body: str) -> None:
    """Envia via SMTP (Mailpit em dev, relay EB em produção)."""
    import aiosmtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    send_kwargs: dict = {
        "hostname": settings.SMTP_HOST,
        "port": settings.SMTP_PORT,
        "use_tls": settings.SMTP_TLS,
    }

    if settings.SMTP_USER and settings.SMTP_PASSWORD:
        send_kwargs["username"] = settings.SMTP_USER
        send_kwargs["password"] = settings.SMTP_PASSWORD
        if not settings.SMTP_TLS and settings.SMTP_PORT == 587:
            send_kwargs["start_tls"] = True

    await aiosmtplib.send(msg, **send_kwargs)
    logger.info("Email enviado via SMTP para %s: %s", to, subject)


# ── Ponto de entrada público ──────────────────────────────────────────────────

async def send_email(to: str, subject: str, html_body: str) -> None:
    """Envia um e-mail HTML de forma assíncrona.

    Usa Resend se ``RESEND_API_KEY`` estiver configurado; caso contrário,
    cai no SMTP (Mailpit em dev).

    Args:
        to:        Endereço de e-mail do destinatário.
        subject:   Assunto da mensagem.
        html_body: Corpo da mensagem em HTML.
    """
    try:
        if settings.RESEND_API_KEY:
            await _send_via_resend(to, subject, html_body)
        else:
            await _send_via_smtp(to, subject, html_body)
    except Exception as exc:
        logger.error("Falha ao enviar email para %s: %s", to, exc)
