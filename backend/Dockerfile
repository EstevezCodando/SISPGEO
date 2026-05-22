FROM python:3.12-slim-bookworm

# Cria usuário não-root antes de qualquer operação
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# Instala dependências do sistema com --no-install-recommends
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Instala dependências Python como root (precisa de acesso a site-packages)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia código-fonte
COPY . .

# Ajusta permissões para o usuário não-root
RUN chown -R appuser:appuser /app

# Troca para usuário não-root
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
