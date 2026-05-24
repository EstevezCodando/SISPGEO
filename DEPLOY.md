# SisPGeo — Guia de Deploy e Configuração de Domínio

> Passo a passo para colocar o sistema no ar em um servidor Linux com domínio próprio.  
> Todos os comandos devem ser executados no servidor de produção via SSH.

---

## Sumário

1. [Pré-requisitos](#1-pré-requisitos)
2. [Clonar e configurar o projeto](#2-clonar-e-configurar-o-projeto)
3. [Configurar o domínio (DNS)](#3-configurar-o-domínio-dns)
4. [Subir o sistema via Docker Compose](#4-subir-o-sistema-via-docker-compose)
5. [Ativar HTTPS com Let's Encrypt (domínio público)](#5-ativar-https-com-lets-encrypt-domínio-público)
6. [Ativar HTTPS com certificado institucional (rede interna EB)](#6-ativar-https-com-certificado-institucional-rede-interna-eb)
7. [Renovação automática do certificado](#7-renovação-automática-do-certificado)
8. [Checklist pós-deploy](#8-checklist-pós-deploy)

---

## 1. Pré-requisitos

```bash
# Verificar se Docker está instalado
docker --version        # deve ser 24+
docker compose version  # deve ser 2.x

# Instalar Docker (Ubuntu/Debian), se necessário
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

Portas que precisam estar abertas no firewall do servidor:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp   # apenas se for usar HTTPS
sudo ufw reload
sudo ufw status
```

---

## 2. Clonar e configurar o projeto

```bash
# Clonar o repositório
git clone <URL_DO_REPO> /opt/sispgeo
cd /opt/sispgeo

# Criar o arquivo de variáveis de ambiente
cp .env.example .env
```

#### Gerar a SECRET_KEY (Linux — servidor de produção)

```bash
# Gera 32 bytes aleatórios em hexadecimal e adiciona ao .env
echo "SECRET_KEY=$(openssl rand -hex 32)" >> .env

# Confirma que foi gravado corretamente
grep SECRET_KEY .env
# Saída esperada: SECRET_KEY=a3f8b2e1c4d7f09a2b5e8c1d4a7f0e3b6c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1
```

> Se o servidor **não tiver o OpenSSL instalado**:
> ```bash
> # Alternativa com /dev/urandom (disponível em qualquer Linux)
> echo "SECRET_KEY=$(cat /dev/urandom | tr -dc 'a-f0-9' | head -c 64)" >> .env
> ```

Abra o `.env` e preencha as demais variáveis obrigatórias:

```bash
nano .env
```

Variáveis obrigatórias no `.env`:

```env
# Banco de dados
DB_PASSWORD=senha_forte_aqui

# JWT — gerada pelo comando acima; não altere depois de subir o sistema
SECRET_KEY=cole_aqui_se_nao_usou_o_comando_acima

# URL pública do frontend (sem barra no final)
FRONTEND_URL=https://meudominio.lala.lala

# E-mail (Zimbra institucional ou SMTP externo)
SMTP_HOST=smtp.webmail.eb.mil.br
SMTP_PORT=587
SMTP_FROM=sispgeo@eb.mil.br
SMTP_USER=usuario@eb.mil.br
SMTP_PASSWORD=senha_do_email

# Ambiente
ENV=production
```

---

## 3. Configurar o domínio (DNS)

No painel do provedor do domínio (ou no servidor DNS interno da EB),
crie um **registro A** apontando para o IP público do servidor:

```
Tipo  Nome                      Valor
A     meudominio.lala.lala      203.0.113.10   ← IP do servidor
A     www.meudominio.lala.lala  203.0.113.10   ← opcional
```

Verifique se a propagação ocorreu (pode levar até 24h):

```bash
# No servidor ou na sua máquina
dig meudominio.lala.lala +short
# deve retornar o IP do servidor

# Alternativa
nslookup meudominio.lala.lala
```

Atualize o `server_name` no nginx antes de subir:

```bash
# Abra o arquivo de configuração do nginx
nano nginx/nginx.conf

# Substitua na linha server_name:
#   server_name sispgeo.dsg.eb.mil.br;
# pelo seu domínio:
#   server_name meudominio.lala.lala;
```

---

## 4. Subir o sistema via Docker Compose

```bash
cd /opt/sispgeo

# Build e subida de todos os serviços
docker compose up -d --build

# Verificar se todos os containers estão rodando
docker compose ps

# Acompanhar logs em tempo real
docker compose logs -f

# Logs de um serviço específico
docker compose logs -f backend
docker compose logs -f nginx
```

Neste ponto o sistema estará acessível em `http://meudominio.lala.lala`.

---

## 5. Ativar HTTPS com Let's Encrypt (domínio público)

> Use este método se o domínio for acessível pela internet pública.  
> **Não funciona para DNS interno (rede EB)** — use o passo 6 nesses casos.

### 5.1 — Instalar o Certbot

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y certbot

# Verificar instalação
certbot --version
```

### 5.2 — Parar o nginx temporariamente (libera a porta 80)

```bash
docker compose stop nginx
```

### 5.3 — Emitir o certificado

```bash
# Certbot standalone ocupa a porta 80 para validação
sudo certbot certonly --standalone \
  -d meudominio.lala.lala \
  -d www.meudominio.lala.lala \
  --email seu@email.com \
  --agree-tos \
  --non-interactive
```

Os certificados são salvos em `/etc/letsencrypt/live/meudominio.lala.lala/`.

### 5.4 — Copiar os certificados para o projeto

```bash
# Criar pasta de certificados do projeto
mkdir -p /opt/sispgeo/nginx/certs

# Criar link simbólico para os certificados gerados pelo Certbot
sudo ln -s /etc/letsencrypt /opt/sispgeo/nginx/certs
```

### 5.5 — Ativar HTTPS no docker-compose.yml

```bash
nano /opt/sispgeo/docker-compose.yml
```

Descomente as duas linhas no serviço `nginx`:

```yaml
# antes (comentado):
#   - "443:443"
#   - ./nginx/certs:/etc/nginx/certs:ro

# depois (ativo):
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/certs:/etc/nginx/certs:ro
```

E remova a linha `[]` que está logo abaixo de `volumes:`.

### 5.6 — Ativar HTTPS no nginx.conf

```bash
nano /opt/sispgeo/nginx/nginx.conf
```

1. **Comente** o bloco `server { listen 80; ... }` atual (HTTP simples)
2. **Descomente** os dois blocos marcados como `# MODO HTTPS`

```nginx
# Bloco que deve ficar ATIVO após a mudança:

server {
    listen 80;
    server_name meudominio.lala.lala;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name meudominio.lala.lala;

    ssl_certificate     /etc/nginx/certs/live/meudominio.lala.lala/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/live/meudominio.lala.lala/privkey.pem;
    ...
}
```

Lembre de substituir `sispgeo.dsg.eb.mil.br` pelo seu domínio real nos caminhos dos certificados.

### 5.7 — Subir novamente

```bash
cd /opt/sispgeo
docker compose up -d --build nginx
```

Teste no navegador: `https://meudominio.lala.lala` — deve mostrar o cadeado.

---

## 6. Ativar HTTPS com certificado institucional (rede interna EB)

> Use este método quando o domínio é `.eb.mil.br` ou outro DNS interno
> que não é resolvido pela internet pública. O Let's Encrypt não funciona
> nesses casos — o certificado deve ser fornecido pela RCB-EB ou pelo
> administrador de rede.

### 6.1 — Obter os arquivos do certificado

Solicite ao administrador de rede os seguintes arquivos:

| Arquivo            | Descrição                       |
|--------------------|---------------------------------|
| `fullchain.pem`    | Certificado + cadeia intermediária |
| `privkey.pem`      | Chave privada                   |

### 6.2 — Copiar os certificados para o servidor

```bash
# Na sua máquina local, envie via SCP
scp fullchain.pem usuario@IP_SERVIDOR:/opt/sispgeo/nginx/certs/fullchain.pem
scp privkey.pem   usuario@IP_SERVIDOR:/opt/sispgeo/nginx/certs/privkey.pem

# No servidor, ajuste as permissões
chmod 644 /opt/sispgeo/nginx/certs/fullchain.pem
chmod 600 /opt/sispgeo/nginx/certs/privkey.pem
```

### 6.3 — Ajustar os caminhos no nginx.conf

Os certificados não estarão em `/etc/nginx/certs/live/<dominio>/`, mas
diretamente em `/etc/nginx/certs/`. Edite o bloco HTTPS:

```nginx
ssl_certificate     /etc/nginx/certs/fullchain.pem;
ssl_certificate_key /etc/nginx/certs/privkey.pem;
```

### 6.4 — Ajustar o volume no docker-compose.yml e subir

Siga os mesmos passos 5.5 e 5.7 acima.

---

## 7. Renovação automática do certificado

> Apenas para certificados Let's Encrypt. Certificados institucionais devem
> ser renovados manualmente com o administrador de rede.

O Certbot instalado no sistema renova automaticamente. Para garantir que o
nginx seja recarregado após a renovação, configure um hook:

```bash
# Criar o script de renovação
sudo nano /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

Conteúdo do script:

```bash
#!/bin/bash
cd /opt/sispgeo
docker compose exec nginx nginx -s reload
```

```bash
# Tornar executável
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# Testar a renovação (simulação, sem alterar certificados)
sudo certbot renew --dry-run
```

O Certbot já tem um timer systemd ativo que roda duas vezes ao dia.
Verifique com:

```bash
systemctl status certbot.timer
```

---

## 8. Checklist pós-deploy

```
[ ] DNS propagado — dig meudominio.lala.lala retorna o IP correto
[ ] Containers rodando — docker compose ps mostra todos "Up"
[ ] Frontend acessível — https://meudominio.lala.lala abre a tela de login
[ ] API respondendo — https://meudominio.lala.lala/api/v1/health retorna 200
[ ] E-mail funcionando — cadastrar usuário teste e verificar recebimento
[ ] Certificado válido — cadeado verde no navegador (se HTTPS ativo)
[ ] FRONTEND_URL no .env aponta para https:// (link de ativação nos e-mails)
```

---

## Comandos úteis de manutenção

```bash
# Reiniciar todos os serviços
docker compose restart

# Reiniciar apenas o nginx (após mudança de config)
docker compose restart nginx

# Atualizar o sistema (novo deploy)
git pull
docker compose up -d --build

# Ver uso de recursos
docker stats

# Backup do banco de dados
docker compose exec db pg_dump -U sispgeo_user sispgeo > backup_$(date +%Y%m%d).sql

# Restaurar backup
docker compose exec -T db psql -U sispgeo_user sispgeo < backup_20260101.sql
```
