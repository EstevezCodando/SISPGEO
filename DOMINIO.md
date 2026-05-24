# SisPGeo — Configurar Domínio Próprio

> Você comprou um domínio (ex.: `meusite.eb.mil.br`) em um registrador como
> **Registro.br**, **GoDaddy**, **Hostinger** ou similar.
> Este guia mostra exatamente o que fazer para apontar esse domínio para o
> seu servidor e deixar o SisPGeo acessível por ele.

---

## Sumário

1. [Descobrir o IP do seu servidor](#1-descobrir-o-ip-do-seu-servidor)
2. [Criar o registro DNS no painel do registrador](#2-criar-o-registro-dns-no-painel-do-registrador)
3. [Atualizar o nginx](#3-atualizar-o-nginx)
4. [Atualizar o `.env`](#4-atualizar-o-env)
5. [Reiniciar o sistema](#5-reiniciar-o-sistema)
6. [Ativar HTTPS gratuito com Let's Encrypt](#6-ativar-https-gratuito-com-lets-encrypt)
7. [Verificar se tudo funciona](#7-verificar-se-tudo-funciona)

---

## 1. Descobrir o IP do seu servidor

No terminal do servidor, execute:

```bash
curl -s ifconfig.me
# ou
hostname -I | awk '{print $1}'
```

Anote o IP — você vai precisar dele no próximo passo.

---

## 2. Criar o registro DNS no painel do registrador

Acesse o painel do registrador onde comprou o domínio e crie um **registro do tipo A**:

| Campo        | Valor                          |
|--------------|--------------------------------|
| **Tipo**     | `A`                            |
| **Nome/Host**| `@` (representa o domínio raiz)|
| **Valor/IP** | IP do seu servidor             |
| **TTL**      | `3600` (ou "Automático")       |

> Se quiser que `www.meusite.eb.mil.br` também funcione, crie um segundo
> registro A com **Nome/Host** = `www` apontando para o mesmo IP.
> Ou crie um registro **CNAME** `www` → `meusite.eb.mil.br`.

### Como chegar lá nos registradores mais comuns

**Registro.br**
1. Acesse [registro.br](https://registro.br) → Entre com sua conta
2. Clique no domínio → **DNS** → **Editar zona**
3. Adicione o registro A conforme a tabela acima

**GoDaddy**
1. [godaddy.com](https://godaddy.com) → Meus Produtos → DNS
2. Seção **Registros** → Adicionar → Tipo A

**Hostinger**
1. Painel → Domínios → Gerenciar → **DNS / Nameservers**
2. Registros DNS → Adicionar registro → Tipo A

**Cloudflare** (se usar como DNS, mesmo que o domínio seja de outro registrador)
1. Painel → seu domínio → **DNS** → Adicionar registro
2. Tipo A, nome `@`, IPv4 do servidor
3. Mantenha o **proxy desativado (nuvem cinza)** durante o primeiro teste

> **A propagação do DNS pode levar até 24h**, mas costuma ser rápida (5–30 min).
> Você pode acompanhar em: [dnschecker.org](https://dnschecker.org)

---

## 3. Atualizar o nginx

Edite `nginx/nginx.conf` no servidor e substitua o `server_name`:

```bash
nano /opt/sispgeo/nginx/nginx.conf
```

```nginx
# Linha atual:
server_name sispgeo.dsg.eb.mil.br;

# Substituir por:
server_name meusite.eb.mil.br;
```

Se quiser aceitar também o `www`:

```nginx
server_name meusite.eb.mil.br www.meusite.eb.mil.br;
```

---

## 4. Atualizar o `.env`

```bash
nano /opt/sispgeo/.env
```

Localize a linha `FRONTEND_URL` e atualize:

```env
# Antes de ativar HTTPS:
FRONTEND_URL=http://meusite.eb.mil.br

# Após ativar HTTPS (seção 6):
# FRONTEND_URL=https://meusite.eb.mil.br
```

> `FRONTEND_URL` é usada nos links dos e-mails enviados pelo sistema
> (ativação de conta, recuperação de senha). Se estiver errada, os links
> dos e-mails não vão funcionar.

---

## 5. Reiniciar o sistema

```bash
cd /opt/sispgeo

# Se o sistema já está rodando, só o nginx precisa ser reiniciado:
docker compose restart nginx

# Se estiver subindo pela primeira vez:
docker compose up -d --build
```

Neste momento o sistema já deve estar acessível em `http://meusite.eb.mil.br`.

---

## 6. Ativar HTTPS gratuito com Let's Encrypt

Com um domínio público e registrado, você pode obter um certificado SSL
**gratuito e automático** pelo Let's Encrypt.

### 6.1 — Instalar o Certbot

```bash
sudo apt update
sudo apt install -y certbot
```

### 6.2 — Parar o nginx momentaneamente

O Certbot precisa da porta 80 livre por alguns segundos para validar o domínio:

```bash
docker compose stop nginx
```

### 6.3 — Emitir o certificado

```bash
sudo certbot certonly --standalone \
  -d meusite.eb.mil.br \
  --email seu@email.com \
  --agree-tos \
  --non-interactive
```

Se quiser incluir o `www`:

```bash
sudo certbot certonly --standalone \
  -d meusite.eb.mil.br \
  -d www.meusite.eb.mil.br \
  --email seu@email.com \
  --agree-tos \
  --non-interactive
```

Os certificados são salvos em:
```
/etc/letsencrypt/live/meusite.eb.mil.br/fullchain.pem
/etc/letsencrypt/live/meusite.eb.mil.br/privkey.pem
```

### 6.4 — Criar link simbólico para os certificados

```bash
mkdir -p /opt/sispgeo/nginx/certs
sudo ln -s /etc/letsencrypt /opt/sispgeo/nginx/certs/letsencrypt
```

### 6.5 — Ativar HTTPS no `docker-compose.yml`

```bash
nano /opt/sispgeo/docker-compose.yml
```

Descomente as duas linhas no serviço `nginx`:

```yaml
# Antes:
ports:
  - "80:80"
# - "443:443"
# volumes:
#   - ./nginx/certs:/etc/nginx/certs:ro

# Depois:
ports:
  - "80:80"
  - "443:443"
volumes:
  - ./nginx/certs:/etc/nginx/certs:ro
```

### 6.6 — Ativar HTTPS no `nginx/nginx.conf`

Abra o arquivo e faça as duas alterações indicadas:

```bash
nano /opt/sispgeo/nginx/nginx.conf
```

1. **Comente** o bloco HTTP atual
2. **Descomente** os dois blocos HTTPS que estão comentados ao final do arquivo

Nos dois blocos descomentados, substitua o domínio de exemplo pelo seu:

```nginx
# Redirecionar HTTP → HTTPS
server {
    listen 80;
    server_name meusite.eb.mil.br;
    return 301 https://$host$request_uri;
}

# Bloco HTTPS principal
server {
    listen 443 ssl;
    server_name meusite.eb.mil.br;

    ssl_certificate     /etc/nginx/certs/letsencrypt/live/meusite.eb.mil.br/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/letsencrypt/live/meusite.eb.mil.br/privkey.pem;
    ...
}
```

### 6.7 — Atualizar `.env` e subir

```bash
# Atualizar FRONTEND_URL para https://
nano /opt/sispgeo/.env
# FRONTEND_URL=https://meusite.eb.mil.br

# Subir novamente
cd /opt/sispgeo
docker compose up -d --build nginx
```

### 6.8 — Renovação automática

O Certbot renova o certificado automaticamente (o timer systemd já vem ativo).
Configure o hook para recarregar o nginx após a renovação:

```bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy

sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh > /dev/null <<'EOF'
#!/bin/bash
cd /opt/sispgeo
docker compose exec nginx nginx -s reload
EOF

sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# Testar renovação (simulação, sem alterar certificados)
sudo certbot renew --dry-run
```

---

## 7. Verificar se tudo funciona

```bash
# DNS propagado?
dig meusite.eb.mil.br +short
# deve retornar o IP do servidor

# API respondendo?
curl -s https://meusite.eb.mil.br/api/v1/health
# esperado: {"status":"ok","version":"..."}

# Certificado válido?
curl -sI https://meusite.eb.mil.br | grep -i "HTTP/"
# esperado: HTTP/2 200
```

Checklist rápido:

```
[ ] Registro A criado no painel do registrador
[ ] DNS propagado — dig meusite.eb.mil.br retorna o IP correto
[ ] server_name no nginx.conf atualizado
[ ] FRONTEND_URL no .env atualizado
[ ] Sistema acessível — meusite.eb.mil.br abre a tela de login
[ ] (HTTPS) Certbot emitiu o certificado sem erros
[ ] (HTTPS) Cadeado verde no navegador
[ ] (HTTPS) FRONTEND_URL usa https:// — links dos e-mails funcionam
[ ] (HTTPS) certbot renew --dry-run não retorna erros
```
