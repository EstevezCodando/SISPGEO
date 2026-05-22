"""
Configuração centralizada de logging para o SISGEO.

Uso:
    from app.utils.logging_config import setup_logging, get_logger

    setup_logging()                      # chame uma vez em main.py
    logger = get_logger(__name__)        # em cada módulo
"""

import logging
import sys
from app.config import settings

_LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s — %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

_LEVEL_MAP: dict[str, int] = {
    "debug":    logging.DEBUG,
    "info":     logging.INFO,
    "warning":  logging.WARNING,
    "error":    logging.ERROR,
    "critical": logging.CRITICAL,
}


def setup_logging(level: str | None = None) -> None:
    """Configura o logging global da aplicação.

    Deve ser chamado **uma única vez**, em `main.py`, antes de qualquer
    import de router ou serviço.

    Args:
        level: Nível desejado (``"debug"``–``"critical"``).
               Se ``None``, usa ``"debug"`` em desenvolvimento e
               ``"info"`` em produção.
    """
    if level is None:
        level = "debug" if settings.ENV == "development" else "info"

    numeric_level = _LEVEL_MAP.get(level.lower(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))

    root = logging.getLogger()
    root.setLevel(numeric_level)

    # Evita handlers duplicados em reloads do uvicorn
    root.handlers.clear()
    root.addHandler(handler)

    # Reduz verbosidade de bibliotecas de terceiros
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("aiosmtplib").setLevel(logging.WARNING)

    logging.getLogger(__name__).debug("Logging configurado — nível: %s", level.upper())


def get_logger(name: str) -> logging.Logger:
    """Atalho para ``logging.getLogger(name)``.

    Args:
        name: Normalmente ``__name__`` do módulo chamador.

    Returns:
        Instância de :class:`logging.Logger`.
    """
    return logging.getLogger(name)
