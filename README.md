# SisPGeo — Sistema de Pedidos de Geoinformação

[![CI — Build & Test](https://github.com/EstevezCodando/SISGEO/actions/workflows/ci.yml/badge.svg)](https://github.com/EstevezCodando/SISGEO/actions/workflows/ci.yml)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![PostgreSQL + PostGIS](https://img.shields.io/badge/PostgreSQL%20%2B%20PostGIS-16--3.4-336791?logo=postgresql&logoColor=white)](https://postgis.net/)

Sistema web para gerenciamento do ciclo de vida de solicitações de produtos geoespaciais do Exército Brasileiro, cobrindo o fluxo completo **OMDS → C. Mil. A → COTER → DSG → CGEO**.

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Tecnologias](#2-tecnologias)
3. [Pré-requisitos](#3-pré-requisitos)
4. [Instalação e Execução](#4-instalação-e-execução)
5. [Perfis e Hierarquia](#5-perfis-e-hierarquia)
6. [Fluxo de Pedidos](#6-fluxo-de-pedidos)
7. [Contratos da API](#7-contratos-da-api)
8. [Notificações](#8-notificações)
9. [Variáveis de Ambiente](#9-variáveis-de-ambiente)
10. [Estrutura do Projeto](#10-estrutura-do-projeto)
11. [Testes](#11-testes)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Visão Geral

O SisPGeo digitaliza e rastreia solicitações de produtos cartográficos (cartas topográficas, ortoimagens, MDT/MDS, CDGV, impressões) por meio de uma hierarquia de aprovação com cinco níveis:

```
SOLICITANTE (OMDS)
    ↓  cria e submete o pedido
SUPERVISOR (C. Mil. A)
    ↓  revisa e consolida por região
CONSOLIDADOR (COTER / COLOG / DECEx / DEC)
    ↓  consolida e encaminha à DSG
GESTOR CARTOGRÁFICO (DSG)
    ↓  atribui ao CGEO responsável
ANALISTA CGEO
    ↓  analisa viabilidade e entrega no BDGEx
PRODUZIDO ✅  — notificação automática a toda a cadeia
```

Cada transição de status gera **notificações in-app e por e-mail**. A DSG possui visão global de todos os pedidos, podendo exportá-los em GeoJSON, verificar duplicatas e marcar um pedido como "Pronto" com notificação automática ao solicitante e superiores.

---

## 2. Tecnologias

### Backend

| Biblioteca | Versão | Função |
|---|---|---|
| Python | 3.12 | Linguagem base |
| FastAPI | 0.115.0 | Framework web assíncrono (ASGI) |
| Uvicorn | 0.30.6 | Servidor ASGI |
| SQLAlchemy | 2.0.36 | ORM assíncrono |
| asyncpg | 0.30.0 | Driver PostgreSQL async |
| Alembic | 1.14.1 | Migrações de banco de dados |
| Pydantic | 2.9.2 | Validação e serialização de dados |
| pydantic-settings | 2.6.1 | Configuração via variáveis de ambiente |
| bcrypt | 4.2.1 | Hash seguro de senhas |
| PyJWT | 2.10.1 | JWT (HS256) — substitui python-jose (CVE-2024-33663) |
| Resend | 2.10.0 | Envio de e-mail transacional (primário) |
| aiosmtplib | — | Envio via SMTP (fallback — Mailpit em dev) |
| httpx | 0.27.2 | Cliente HTTP (mock BDGEx) |
| GeoAlchemy2 | 0.16.0 | Tipos geoespaciais (PostGIS) |
| APScheduler | 3.10.4 | Tarefas agendadas (verificação de janelas) |
| python-multipart | 0.0.12 | Upload multipart |
| Jinja2 | 3.1.4 | Templates HTML para e-mails |
| psycopg2-binary | 2.9.10 | Driver síncrono (Alembic) |

### Frontend

| Biblioteca | Versão | Função |
|---|---|---|
| React | 18.3.1 | Framework de UI |
| TypeScript | 5.5.0 | Tipagem estática |
| Vite | 5.4.0 | Build tool e dev server |
| Tailwind CSS | 3.4.14 | Estilização utility-first (tema zinc/emerald) |
| React Router DOM | 6.26.0 | Roteamento SPA |
| Zustand | 5.0.0 | Gerenciamento de estado global |
| Axios | 1.7.7 | Cliente HTTP com interceptors JWT |
| Leaflet | 1.9.4 | Mapas interativos |
| React Leaflet | 4.2.1 | Componentes React para Leaflet |
| @dnd-kit/core | 6.3.1 | Drag-and-drop (reordenação de prioridades) |
| @dnd-kit/sortable | 10.0.0 | Listas sortable com DnD |
| date-fns | 4.1.0 | Formatação e manipulação de datas |
| lucide-react | 0.454.0 | Biblioteca de ícones |
| react-hot-toast | 2.4.1 | Notificações toast |

### Infraestrutura

| Serviço | Imagem | Porta | Função |
|---|---|---|---|
| PostgreSQL + PostGIS | `postgis/postgis:16-3.4` | interno | Banco de dados geoespacial |
| Backend FastAPI | build local | interno | API REST |
| Frontend React | build local (Nginx) | interno | SPA compilada |
| Nginx | `nginx:1.25-alpine` | **80** | Reverse proxy (API + frontend) |
| Mailpit | `axllent/mailpit:v1.20` | **8025** | Captura de e-mails em desenvolvimento |

---

## 3. Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ≥ 4.x (com BuildKit habilitado)
- [Docker Compose](https://docs.docker.com/compose/) ≥ 2.x (incluso no Docker Desktop)
- Acesso de leitura ao repositório (dados geoespaciais em `dados/`)

---

## 4. Instalação e Execução

### Subir o ambiente completo

```bash
# Clone o repositório
git clone https://github.com/EstevezCodando/SISGEO.git
cd SISGEO

# Copie o template de variáveis de ambiente
cp .env.example .env
```

#### Gerar as credenciais obrigatórias

O sistema **não sobe** em produção se `SECRET_KEY`, `DB_PASSWORD` ou
`ADMIN_PASSWORD` não estiverem definidas.

**🐧 Linux / macOS — terminal:**

```bash
# Gera a SECRET_KEY e já adiciona ao .env
echo "SECRET_KEY=$(openssl rand -hex 32)" >> .env
```

**🪟 Windows — PowerShell** (não precisa de nenhuma ferramenta extra):

```powershell
# Gera a SECRET_KEY com .NET nativo e adiciona ao .env
$key = [System.Convert]::ToHexString(
    [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
).ToLower()
Add-Content .env "SECRET_KEY=$key"
Write-Host "SECRET_KEY gerada: $key"
```

**🪟 Windows — Git Bash / WSL** (se tiver instalado):

```bash
# Mesmo comando do Linux funciona no Git Bash e no WSL
echo "SECRET_KEY=$(openssl rand -hex 32)" >> .env
```

**Qualquer sistema — via Docker** (se o Docker já estiver instalado):

```bash
echo "SECRET_KEY=$(docker run --rm alpine sh -c 'openssl rand -hex 32')" >> .env
```

> Após gerar a `SECRET_KEY`, abra o `.env` e preencha também:
> - `DB_PASSWORD` — senha do PostgreSQL (qualquer valor forte)
> - `ADMIN_PASSWORD` — senha do admin (maiúscula + minúscula + número + símbolo, mín. 8 chars)

```bash
# Suba todos os serviços
docker compose up --build -d
```

A aplicação ficará disponível em:

| Interface | URL |
|---|---|
| Frontend | http://localhost |
| API (Swagger UI) | http://localhost/api/v1/docs |
| Mailpit (e-mails) | http://localhost:8025 |

### Usuários padrão (ambientes de desenvolvimento)

| E-mail | Senha | Perfil |
|---|---|---|
| `admin@eb.mil.br` | valor de `ADMIN_PASSWORD` no `.env` | GESTOR_CARTOGRAFICO (DSG) |
| `gustavo@eb.mil.br` | `Gustavo@1234` | SOLICITANTE |
| `joao@eb.mil.br` | `Joao@1234` | SOLICITANTE |

> Os usuários de teste (`gustavo`, `joao`) são criados apenas quando
> `BDGEX_MOCK=true`. **Nunca ative `BDGEX_MOCK=true` em produção.**  
> A senha do admin é sempre a definida em `ADMIN_PASSWORD` — não há senha padrão hardcoded.

### Comandos úteis

```bash
# Ver logs do backend em tempo real
docker compose logs -f backend

# Recriar apenas o frontend após mudanças de código
docker compose build --no-cache frontend && docker compose up -d frontend

# Resetar banco (apaga todos os dados)
docker compose down -v && docker compose up --build -d

# Acessar o container do backend
docker exec -it sispgeo_backend bash
```

---

## 5. Perfis e Hierarquia

| Perfil | Sigla | Responsabilidade |
|---|---|---|
| `SOLICITANTE` | OMDS | Cria, edita e submete pedidos |
| `SUPERVISOR` | C. Mil. A | Revisa e consolida pedidos por região militar |
| `CONSOLIDADOR` | COTER / COLOG / DECEx / DEC | Consolida e encaminha à DSG |
| `GESTOR_CARTOGRAFICO` | DSG | Visão global, atribuição ao CGEO, exportação |
| `ANALISTA_CGEO` | CGEO | Análise de viabilidade e entrega |

O acesso a cada tela e ação da API é restrito ao perfil correspondente via middleware `require_profiles`.

---

## 6. Fluxo de Pedidos

### Status do ciclo de vida

```
RASCUNHO
  → AGUARDANDO_SUPERVISOR   (submetido pelo SOLICITANTE ou SUPERVISOR)
  → AGUARDANDO_CONSOLIDADOR (aprovado pelo SUPERVISOR)
  → AGUARDANDO_CARTOGRAFICO (consolidado pelo CONSOLIDADOR)
  → ATRIBUIDO_CGEO          (atribuído pela DSG)
  → APROVADO                (viabilidade confirmada pelo CGEO)
  → PRODUZIDO               (entregue no BDGEx)
  → DEVOLVIDO               (retornado para ajustes)
  → CANCELADO               (reprovado definitivamente)
```

### Ações por perfil

| Perfil | Ações disponíveis |
|---|---|
| SOLICITANTE | Criar, editar (RASCUNHO/DEVOLVIDO), submeter, cancelar, reordenar |
| SUPERVISOR | Aprovar, devolver, reprovar, consolidar em lote |
| CONSOLIDADOR | Consolidar em lote para a DSG |
| GESTOR_CARTOGRAFICO | Atribuir ao CGEO, dar pronto, exportar, administrar |
| ANALISTA_CGEO | Aprovar, reprovar, dar pronto com link BDGEx |

### Janelas de submissão

Pedidos só podem ser **submetidos** enquanto há uma janela de submissão ativa (gerenciada pela DSG). Fora da janela, os pedidos permanecem em RASCUNHO.

---

## 7. Contratos da API

Base URL: `/api/v1`  
Autenticação: `Authorization: Bearer <JWT>` (exceto endpoints públicos de auth)

### 7.1 Autenticação

| Método | Endpoint | Acesso | Descrição |
|---|---|---|---|
| `POST` | `/auth/register` | Público | Cadastro (aguarda ativação pelo admin) |
| `POST` | `/auth/login` | Público | Login → retorna JWT |
| `GET` | `/auth/confirm-email/{token}` | Público | Confirmação de e-mail |
| `POST` | `/auth/forgot-password` | Público | Solicita redefinição de senha |
| `POST` | `/auth/reset-password` | Público | Redefine senha com token |

### 7.2 Usuários

| Método | Endpoint | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/users/me` | Autenticado | Perfil do usuário logado |
| `PUT` | `/users/me` | Autenticado | Atualizar dados cadastrais |
| `GET` | `/users/mesma-om` | Autenticado | Colegas da mesma OM |
| `POST` | `/users/{id}/transferir-pedidos` | SOLICITANTE | Herança de pedidos ao mudar de OM |
| `GET` | `/users/` | GESTOR_CARTOGRAFICO | Listar todos os usuários |
| `PUT` | `/users/{id}/ativar` | GESTOR_CARTOGRAFICO | Ativar ou desativar usuário |
| `GET` | `/users/me/notifications` | Autenticado | Últimas 50 notificações |
| `PUT` | `/users/me/notifications/{id}/read` | Autenticado | Marcar notificação como lida |

### 7.3 Pedidos — Fluxo principal

| Método | Endpoint | Acesso | Descrição |
|---|---|---|---|
| `POST` | `/pedidos/` | SOLICITANTE, SUPERVISOR, CONSOLIDADOR | Criar rascunho |
| `GET` | `/pedidos/` | Autenticado | Listar pedidos do perfil |
| `GET` | `/pedidos/pending` | Autenticado | Pedidos aguardando ação |
| `GET` | `/pedidos/{id}` | Dono ou gestor | Detalhe de um pedido |
| `PUT` | `/pedidos/{id}` | Dono (RASCUNHO/DEVOLVIDO) | Editar pedido |
| `DELETE` | `/pedidos/{id}` | Dono | Cancelar pedido |
| `POST` | `/pedidos/{id}/submit` | Dono | Submeter ao próximo nível |
| `PUT` | `/pedidos/{id}/review` | SUPERVISOR, CONSOLIDADOR | Aprovar / devolver / reprovar |
| `POST` | `/pedidos/consolidate` | SUPERVISOR, CONSOLIDADOR | Consolidar em lote |
| `PUT` | `/pedidos/reorder` | SOLICITANTE, SUPERVISOR, CONSOLIDADOR | Reordenar prioridade |
| `PUT` | `/pedidos/{id}/items/reorder` | Autenticado | Reordenar itens do pedido |
| `GET` | `/pedidos/{id}/historico` | Dono ou gestor | Auditoria de transições de status |

**Valores de `acao` no review:**

| Ação | Resultado |
|---|---|
| `aprovar` | Avança ao próximo status |
| `editar` / `devolver` | Retorna ao solicitante (`DEVOLVIDO`) |
| `reprovar` | Encerra como `CANCELADO` (motivo obrigatório) |

### 7.4 Pedidos — Gestão DSG

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/pedidos/admin/all` | Todos os pedidos com filtros (`?status=&orgao_vinculante=&q=`) |
| `PUT` | `/pedidos/admin/{id}` | Override de qualquer campo |
| `DELETE` | `/pedidos/admin/{id}` | Excluir qualquer pedido |
| `POST` | `/pedidos/admin/export` | Download GeoJSON com atributos completos |
| `GET` | `/pedidos/export` | Download ZIP (relatório TXT + GeoJSON) |
| `GET` | `/pedidos/duplicatas` | Itens duplicados entre pedidos ativos |
| `PUT` | `/pedidos/{id}/assign-cgeo` | Atribuir pedido ao CGEO |
| `POST` | `/pedidos/{id}/dar-pronto` | Marcar PRODUZIDO + notificar cadeia |

### 7.5 Pedidos — CGEO

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/pedidos/cgeo-atendimento` | Pedidos atribuídos ao analista |
| `PUT` | `/pedidos/{id}/cgeo-review` | Análise: `aprovar`, `reprovar`, `pronto` |

### 7.6 Mapa e Grade INOM

| Método | Endpoint | Parâmetros | Descrição |
|---|---|---|---|
| `GET` | `/map/inom-grid` | `?scale=1:50.000&tipo_produto=CARTA_TOPOGRAFICA` | Grade INOM (GeoJSON gzip) |
| `POST` | `/map/features-preview` | `[{inom, escala, tipo_produto}]` | Geometrias de INOMs específicos |
| `GET` | `/pedidos/map-features` | — | Todos os itens do usuário no mapa |
| `GET` | `/pedidos/{id}/features` | — | Itens de um pedido específico no mapa |

### 7.7 Operações, Janelas e Métricas

| Método | Endpoint | Acesso | Descrição |
|---|---|---|---|
| `GET/POST` | `/operacoes/` | Autenticado | Operações da OM do usuário |
| `GET` | `/janelas/` | Autenticado | Todas as janelas de submissão |
| `GET` | `/janelas/active` | Autenticado | Janelas abertas no momento |
| `POST` | `/janelas/` | GESTOR_CARTOGRAFICO | Criar janela |
| `GET` | `/transferencias/minhas` | Autenticado | Histórico de herança do usuário |
| `GET` | `/metricas/resumo` | GESTOR_CARTOGRAFICO | Pedidos por status/órgão (últimos 7 dias) |
| `GET` | `/metricas/pedidos` | GESTOR_CARTOGRAFICO | Distribuição por tipo, escala e órgão |

---

## 8. Notificações

### In-app
- Contador no ícone 🔔 da navbar, atualizado a cada 30 s
- Endpoint: `GET /users/me/notifications` → últimas 50 notificações
- `PUT /users/me/notifications/{id}/read` → marca como lida

### Por e-mail
- **Primário**: [Resend](https://resend.com) (configurar `RESEND_API_KEY` em produção)
- **Fallback**: SMTP via `aiosmtplib` (Mailpit em desenvolvimento → `http://localhost:8025`)
- Templates HTML via Jinja2

### Eventos que disparam notificações

| Evento | In-app | E-mail | Destinatários |
|---|---|---|---|
| Pedido submetido | ✅ | ✅ | SUPERVISOR do CMilA |
| Pedido consolidado pelo Supervisor | ✅ | ✅ | CONSOLIDADOR do órgão |
| Pedido consolidado pelo Consolidador | ✅ | ✅ | GESTOR_CARTOGRAFICO (global) |
| Pedido atribuído ao CGEO | ✅ | ✅ | ANALISTA_CGEO |
| Pedido devolvido | ✅ | ✅ | Solicitante |
| Pedido reprovado / cancelado | ✅ | ✅ | Solicitante |
| CGEO aprova pedido | ✅ | — | GESTOR_CARTOGRAFICO |
| Dar o Pronto | ✅ | ✅ | Solicitante + SUPERVISOR + CONSOLIDADOR |
| Pedido transferido (herança) | ✅ | ✅ | Novo responsável |

---

## 9. Variáveis de Ambiente

Copie `.env.example` para `.env` e ajuste conforme o ambiente:

```env
# Banco de dados
DB_PASSWORD=senha_forte_aqui   # obrigatório — falha na subida se vazio

# Segurança JWT
# Gere com: openssl rand -hex 32
SECRET_KEY=                    # obrigatório — falha na subida se vazio
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

# Usuário admin inicial (admin@eb.mil.br)
# Requisitos: maiúscula, minúscula, número e caractere especial (mín. 8 chars)
ADMIN_PASSWORD=                # obrigatório — falha na subida se vazio

# E-mail — Resend (produção)
RESEND_API_KEY=re_sua_chave_aqui
RESEND_FROM=noreply@seudominio.com.br

# E-mail — SMTP (fallback / desenvolvimento)
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_TLS=false

# BDGEx
BDGEX_API_URL=https://bdgex.eb.mil.br/api
BDGEX_MOCK=false               # nunca true em produção

# Aplicação
ENV=development
FRONTEND_URL=http://localhost
```

#### Como gerar `SECRET_KEY`

**🐧 Linux / macOS:**
```bash
openssl rand -hex 32
# Saída: a3f8b2e1c4d7f09a2b5e8c1d4a7f0e3b6c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1
```

**🪟 Windows — PowerShell:**
```powershell
[System.Convert]::ToHexString(
    [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
).ToLower()
# Saída: a3f8b2e1c4d7f09a2b5e8c1d4a7f0e3b6c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1
```

**🪟 Windows — Git Bash ou WSL:**
```bash
openssl rand -hex 32
```

Cole o valor gerado na variável `SECRET_KEY` no arquivo `.env`.

> **Produção:** `BDGEX_MOCK=false`, `ENV=production`, `SECRET_KEY` gerada com
> `openssl rand -hex 32`, `ADMIN_PASSWORD` com requisitos de complexidade e
> `FRONTEND_URL` apontando para `https://`.  
> O sistema **recusa a inicialização** se qualquer uma dessas regras for violada.

---

## 10. Estrutura do Projeto

```
SisPGeo/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI: lifespan, CORS, routers
│   │   ├── database.py                 # AsyncSessionLocal, engine assíncrono
│   │   ├── dependencies.py             # get_db, get_current_user, require_profiles
│   │   ├── config.py                   # Settings via pydantic-settings
│   │   ├── models/
│   │   │   ├── enums.py                # Todos os enums do sistema
│   │   │   ├── user.py                 # Usuario, TokenSenha
│   │   │   ├── pedido.py               # Pedido, ItemPedido
│   │   │   ├── operacao.py             # Operacao
│   │   │   ├── janela.py               # JanelaPedido
│   │   │   ├── notificacao.py          # Notificacao
│   │   │   ├── pedido_historico.py     # PedidoHistorico
│   │   │   ├── pedido_transferencia.py # PedidoTransferencia
│   │   │   └── api_metrica.py          # ApiMetrica
│   │   ├── routers/
│   │   │   ├── auth.py                 # /auth/*
│   │   │   ├── users.py                # /users/*
│   │   │   ├── pedidos.py              # /pedidos/* — core do fluxo
│   │   │   ├── map_layers.py           # /map/* (grade INOM, preview)
│   │   │   ├── operacoes.py            # /operacoes/*
│   │   │   ├── janelas.py              # /janelas/*
│   │   │   ├── historico.py            # /pedidos/{id}/historico
│   │   │   ├── transferencias.py       # /transferencias/*
│   │   │   ├── metricas.py             # /metricas/*
│   │   │   ├── om_data.py              # /om-data/* (OM do EB)
│   │   │   └── oms.py                  # /oms/* (OMs customizadas)
│   │   ├── schemas/                    # Modelos Pydantic de entrada/saída
│   │   ├── services/
│   │   │   ├── auth_service.py         # login, register, forgot/reset password
│   │   │   ├── pedido_service.py       # submit, review, consolidate, assign_cgeo
│   │   │   ├── notification_service.py # notify_user, notify_by_perfil
│   │   │   ├── email_service.py        # Resend (primário) + SMTP (fallback)
│   │   │   ├── bdgex_service.py        # Grade INOM, cache, mock BDGEx
│   │   │   └── historico_service.py    # registrar_historico
│   │   ├── middleware/
│   │   │   └── metrics.py              # Coleta de métricas de API
│   │   └── utils/
│   │       ├── security.py             # JWT, bcrypt
│   │       ├── email_templates.py      # Templates HTML Jinja2
│   │       └── logging_config.py       # Configuração de logs estruturados
│   ├── tests/
│   │   ├── conftest.py                 # Fixtures compartilhadas (mocks)
│   │   ├── test_auth_service.py        # Testes unitários de autenticação
│   │   ├── test_pedido_service.py      # Testes unitários do fluxo de pedidos
│   │   ├── test_notification_service.py
│   │   └── test_api_integration.py     # Testes de integração (API real)
│   ├── requirements.txt
│   ├── pytest.ini
│   └── Dockerfile
│
├── frontend/
│   ├── public/
│   │   └── dsg.png                     # Logotipo DSG (Navbar e Login)
│   ├── src/
│   │   ├── App.tsx                     # Roteamento (público + protegido por perfil)
│   │   ├── api/                        # Clientes HTTP por domínio
│   │   ├── components/
│   │   │   ├── layout/                 # AppLayout, Navbar, Sidebar, DeadlineBanner
│   │   │   └── map/                    # InteractiveMap, PedidosMap
│   │   ├── pages/
│   │   │   ├── Login.tsx / Register.tsx
│   │   │   ├── Dashboard.tsx           # Cards por perfil
│   │   │   ├── SolicitarProdutos.tsx   # Mapa + seleção INOM + carrinho + revisão
│   │   │   ├── MeusPedidos.tsx         # Lista e reordenação de pedidos
│   │   │   ├── MeusDados.tsx           # Perfil + herança de pedidos
│   │   │   ├── Ajuda.tsx               # Catálogo de produtos e tutoriais
│   │   │   ├── gestor/                 # Supervisor e Consolidador
│   │   │   ├── dsg/                    # DSG: pedidos, janelas, relatórios
│   │   │   ├── cgeo/                   # CGEO: análise de viabilidade
│   │   │   └── admin/                  # Admin: usuários, pedidos, métricas
│   │   ├── store/
│   │   │   ├── authStore.ts            # Zustand: user, token, helpers de perfil
│   │   │   └── cartStore.ts            # Carrinho de seleção de folhas INOM
│   │   └── types/                      # TypeScript: Pedido, Usuario, enums
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── Dockerfile
│
├── dados/                              # Dados geoespaciais (não versionados)
│   └── cache/                          # Cache de grades INOM (gerado em runtime)
│
├── nginx/
│   └── nginx.conf                      # Reverse proxy: / → frontend, /api → backend
│
├── .github/
│   └── workflows/
│       └── ci.yml                      # Pipeline CI: build + testes unitários e integração
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 11. Testes

```bash
# Rodar todos os testes dentro do container
docker exec sispgeo_backend python -m pytest tests/ -v

# Apenas testes unitários (sem banco)
docker exec sispgeo_backend python -m pytest tests/ -v \
  --ignore=tests/test_api_integration.py

# Apenas testes de integração (requer backend em execução)
docker exec sispgeo_backend python -m pytest tests/test_api_integration.py -v
```

Os testes unitários usam `MagicMock` / `AsyncMock` — sem dependência de banco de dados. Os testes de integração chamam a API real rodando no container e requerem `BDGEX_MOCK=true`.

O CI executa automaticamente a cada push ou pull request para `main`.

---

## 12. Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| `invalid enum value` no banco | Enum PostgreSQL com valores antigos | `docker compose down -v && docker compose up --build -d` |
| Frontend exibe versão anterior | Container não reconstruído | `docker compose build --no-cache frontend && docker compose up -d frontend` + `Ctrl+Shift+R` |
| E-mails não chegam | Comportamento esperado em desenvolvimento | Acesse http://localhost:8025 — Mailpit captura todos os envios |
| `502 Bad Gateway` após restart | Backend ainda inicializando | Aguardar 5–10 s e tentar novamente |
| Pedido não aparece para o Supervisor | CMilA divergente | `regiao_militar` do solicitante deve ser igual ao do supervisor (ex.: `CMP`) |
| Notificação não é recebida | Campo de filtro divergente | Verificar `regiao_militar` (SUPERVISOR) ou `orgao_vinculante` (CONSOLIDADOR) |
| Analista CGEO não vê o pedido | `cgeo_id` divergente | O `cgeo_id` do pedido (atribuído pela DSG) deve coincidir com o do analista |
| Botão "Dar o Pronto" ausente | Status inelegível | Disponível apenas em: `AGUARDANDO_CARTOGRAFICO`, `ATRIBUIDO_CGEO`, `APROVADO` |
