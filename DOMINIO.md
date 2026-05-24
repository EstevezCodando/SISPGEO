# SisPGeo — Configurar Domínio Próprio no Linux

> Passo a passo para apontar um domínio customizado (ex.: `meusite.mi.local.br`)
> para o sistema em um servidor Linux.  
> Todos os comandos devem ser executados **no servidor**, salvo quando indicado.

---

## Sumário

1. [Alterar o `server_name` no nginx](#1-alterar-o-server_name-no-nginx)
2. [Atualizar o `.env`](#2-atualizar-o-env)
3. [Opção A — Resolução local via `/etc/hosts`](#3-opção-a--resolução-local-via-etchosts)
4. [Opção B — DNS interno (BIND9)](#4-opção-b--dns-interno-bind9)
5. [Opção C — DNS do roteador/servidor DHCP](#5-opção-c--dns-do-roteadorservidor-dhcp)
6. [Subir o sistema](#6-subir-o-sistema)
7. [Verificar a resolução do domínio](#7-verificar-a-resolução-do-domínio)
8. [Ativar HTTPS com certificado interno](#8-ativar-https-com-certificado-interno)
9. [Checklist final](#9-checklist-final)

---

## 1. Alterar o `server_name` no nginx

O arquivo `nginx/nginx.conf` precisa saber qual domínio aceitar.

```bash
nano /opt/sispgeo/nginx/nginx.conf
```

Localize a linha `server_name` e substitua pelo seu domínio:

```nginx
# antes
server_name sispgeo.dsg.eb.mil.br;

# depois
server_name meusite.mi.local.br;
```

> Se também quiser aceitar acesso direto por IP, adicione o IP na mesma linha:
> ```nginx
> server_name meusite.mi.local.br 203.0.113.10;
> ```

---

## 2. Atualizar o `.env`

O backend usa `FRONTEND_URL` para montar links nos e-mails enviados
(ativação de conta, recuperação de senha). Atualize para o seu domínio:

```bash
nano /opt/sispgeo/.env
```

```env
# HTTP (antes de ativar HTTPS)
FRONTEND_URL=http://meusite.mi.local.br

# HTTPS (após ativar certificado — veja seção 8)
# FRONTEND_URL=https://meusite.mi.local.br
```

---

## 3. Opção A — Resolução local via `/etc/hosts`

Use esta opção quando quiser testar em **uma única máquina** sem configurar
DNS de rede.

### No servidor (e/ou nas máquinas clientes)

```bash
sudo nano /etc/hosts
```

Adicione a linha ao final do arquivo:

```
# SisPGeo — domínio interno
203.0.113.10  meusite.mi.local.br
```

> Substitua `203.0.113.10` pelo IP real do servidor.

Para múltiplos clientes, o mesmo arquivo precisa ser editado em **cada máquina**
que for acessar o sistema. Para evitar isso, use a Opção B ou C.

### Testar imediatamente

```bash
ping -c 1 meusite.mi.local.br
# deve responder do IP do servidor

curl -s http://meusite.mi.local.br/api/v1/health
# deve retornar {"status":"ok",...}
```

---

## 4. Opção B — DNS interno (BIND9)

Use esta opção para que **toda a rede** resolva o domínio automaticamente,
sem editar `/etc/hosts` em cada máquina.

### 4.1 Instalar o BIND9

```bash
sudo apt update
sudo apt install -y bind9 bind9utils bind9-doc
```

### 4.2 Criar a zona DNS para `mi.local.br`

```bash
sudo nano /etc/bind/named.conf.local
```

Adicione ao final:

```bind
zone "mi.local.br" {
    type master;
    file "/etc/bind/db.mi.local.br";
};
```

### 4.3 Criar o arquivo de zona

```bash
sudo cp /etc/bind/db.local /etc/bind/db.mi.local.br
sudo nano /etc/bind/db.mi.local.br
```

Substitua o conteúdo pelo seguinte (ajuste o IP do servidor):

```bind
;
; Zona DNS interna — mi.local.br
;
$TTL    604800
@       IN  SOA  ns1.mi.local.br. admin.mi.local.br. (
                      2026052401  ; Serial (AAAAMMDDRR — incremente a cada mudança)
                      604800      ; Refresh
                       86400      ; Retry
                     2419200      ; Expire
                      604800 )    ; Negative Cache TTL
;
; Servidores de nomes
@       IN  NS  ns1.mi.local.br.

; Registros A
ns1         IN  A   203.0.113.10    ; IP do próprio servidor DNS
meusite     IN  A   203.0.113.10    ; IP do servidor SisPGeo
```

> O campo `Serial` deve ser incrementado toda vez que o arquivo de zona for
> alterado. Convenção: `AAAAMMDDRR` (ano-mês-dia-revisão). Ex: `2026052401`.

### 4.4 Verificar a configuração e reiniciar

```bash
# Verificar sintaxe da zona
sudo named-checkzone mi.local.br /etc/bind/db.mi.local.br

# Verificar configuração geral
sudo named-checkconf

# Reiniciar o BIND9
sudo systemctl restart bind9
sudo systemctl enable bind9

# Verificar status
sudo systemctl status bind9
```

### 4.5 Configurar os clientes para usar o servidor DNS

Em cada máquina cliente (ou no servidor DHCP da rede), configure o IP do
servidor DNS para o IP da máquina onde instalou o BIND9:

```bash
# Ubuntu/Debian — editar resolv.conf (temporário)
echo "nameserver 203.0.113.10" | sudo tee /etc/resolv.conf

# Ubuntu com systemd-resolved (permanente)
sudo nano /etc/systemd/resolved.conf
# Adicionar/editar:
# [Resolve]
# DNS=203.0.113.10
# Domains=mi.local.br

sudo systemctl restart systemd-resolved
```

---

## 5. Opção C — DNS do roteador/servidor DHCP

A maioria dos roteadores e servidores DHCP corporativos permite registrar
hostnames estáticos. Acesse o painel de administração do roteador e adicione
uma entrada DNS estática:

| Campo       | Valor               |
|-------------|---------------------|
| Nome / Host | `meusite`           |
| Domínio     | `mi.local.br`       |
| IP          | `203.0.113.10`      |

O procedimento varia por fabricante — consulte a documentação do equipamento.

---

## 6. Subir o sistema

Após configurar o domínio, suba ou reinicie o sistema:

```bash
cd /opt/sispgeo

# Se ainda não subiu:
docker compose up -d --build

# Se já estava rodando, basta reiniciar o nginx para aplicar o novo server_name:
docker compose restart nginx

# Verificar se todos os containers estão saudáveis
docker compose ps
```

---

## 7. Verificar a resolução do domínio

```bash
# A partir do servidor
dig meusite.mi.local.br +short
# deve retornar: 203.0.113.10

nslookup meusite.mi.local.br
# deve responder pelo servidor DNS interno

# Testar a API diretamente
curl -s http://meusite.mi.local.br/api/v1/health
# esperado: {"status":"ok","version":"..."}

# Testar o frontend
curl -s -o /dev/null -w "%{http_code}" http://meusite.mi.local.br/
# esperado: 200
```

---

## 8. Ativar HTTPS com certificado interno

Domínios `.mi.local.br` e similares **não são acessíveis pela internet pública**,
portanto o Let's Encrypt não pode ser usado. O certificado deve ser emitido por
uma **Autoridade Certificadora interna** (ex.: RCB-EB ou CA própria).

### 8.1 Gerar uma CA interna (se não houver)

```bash
# Criar diretório seguro para a CA
sudo mkdir -p /opt/ca && cd /opt/ca

# Gerar chave da CA (guarde com segurança)
openssl genrsa -aes256 -out ca.key 4096

# Gerar certificado raiz da CA (válido por 10 anos)
openssl req -new -x509 -days 3650 -key ca.key -out ca.crt \
  -subj "/C=BR/ST=DF/L=Brasilia/O=MinhaOrg/CN=MinhaCA"
```

### 8.2 Gerar o certificado para o domínio

```bash
cd /opt/ca

# Gerar chave do servidor
openssl genrsa -out meusite.mi.local.br.key 2048

# Gerar CSR (Certificate Signing Request)
openssl req -new -key meusite.mi.local.br.key \
  -out meusite.mi.local.br.csr \
  -subj "/C=BR/ST=DF/L=Brasilia/O=MinhaOrg/CN=meusite.mi.local.br"

# Arquivo de extensões para SAN (Subject Alternative Names)
cat > meusite.ext <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = meusite.mi.local.br
EOF

# Assinar o certificado com a CA (válido por 2 anos)
openssl x509 -req -in meusite.mi.local.br.csr \
  -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out meusite.mi.local.br.crt -days 730 -extfile meusite.ext

# Gerar fullchain (certificado + CA)
cat meusite.mi.local.br.crt ca.crt > fullchain.pem
cp meusite.mi.local.br.key privkey.pem
```

### 8.3 Instalar o certificado raiz nos clientes

Para que os navegadores confiem no certificado, a CA raiz precisa ser instalada
em cada máquina cliente:

```bash
# Ubuntu/Debian
sudo cp /opt/ca/ca.crt /usr/local/share/ca-certificates/minha-ca.crt
sudo update-ca-certificates

# Verificar
openssl verify -CAfile /opt/ca/ca.crt /opt/ca/meusite.mi.local.br.crt
# expected: meusite.mi.local.br.crt: OK
```

> Em **Windows**: clique duas vezes em `ca.crt` → "Instalar certificado" →
> "Autoridades de Certificação Raiz Confiáveis".

### 8.4 Copiar certificados para o projeto e ativar HTTPS

```bash
# Copiar os arquivos para o projeto
mkdir -p /opt/sispgeo/nginx/certs
cp /opt/ca/fullchain.pem /opt/sispgeo/nginx/certs/fullchain.pem
cp /opt/ca/privkey.pem   /opt/sispgeo/nginx/certs/privkey.pem

# Ajustar permissões
chmod 644 /opt/sispgeo/nginx/certs/fullchain.pem
chmod 600 /opt/sispgeo/nginx/certs/privkey.pem
```

Edite `nginx/nginx.conf` para usar o bloco HTTPS (instruções detalhadas em
`DEPLOY.md`, seção 6.3) e ajuste os caminhos:

```nginx
ssl_certificate     /etc/nginx/certs/fullchain.pem;
ssl_certificate_key /etc/nginx/certs/privkey.pem;
```

Descomente as linhas do volume e porta 443 no `docker-compose.yml`:

```yaml
ports:
  - "80:80"
  - "443:443"
volumes:
  - ./nginx/certs:/etc/nginx/certs:ro
```

Atualize o `.env`:

```env
FRONTEND_URL=https://meusite.mi.local.br
```

Suba novamente:

```bash
cd /opt/sispgeo
docker compose up -d --build nginx
```

---

## 9. Checklist final

```
[ ] server_name em nginx/nginx.conf atualizado para meusite.mi.local.br
[ ] FRONTEND_URL no .env atualizado
[ ] DNS resolvendo — dig meusite.mi.local.br retorna o IP correto
[ ] Containers saudáveis — docker compose ps mostra todos "Up"
[ ] Frontend acessível — http://meusite.mi.local.br abre a tela de login
[ ] API respondendo — http://meusite.mi.local.br/api/v1/health retorna 200
[ ] (HTTPS) Certificado instalado e navegador mostra cadeado verde
[ ] (HTTPS) FRONTEND_URL usa https:// — links dos e-mails funcionam
```
