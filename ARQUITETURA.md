# SISGEO — Arquitetura, Contratos e Fluxos

> Sistema Integrado de Solicitações de Geoinformação  
> DSG/EB — Diretoria de Serviço Geográfico do Exército Brasileiro

---

## 1. Visão Geral

O SISGEO digitaliza o processo de solicitação de produtos geoespaciais entre as Organizações Militares (OM) e a DSG. O fluxo percorre uma cadeia hierárquica de aprovação antes de chegar à produção cartográfica.

```
Solicitante (OMDS)
    │  submete pedido
    ▼
Supervisor (C. Mil. A)
    │  consolida e encaminha
    ▼
Consolidador (COTER / COLOG / etc.)
    │  revisa e envia à DSG
    ▼
Gestor Cartográfico (DSG)
    │  distribui para análise
    ▼
Analista CGEO
    │  avalia viabilidade e produz
    ▼
Produto entregue no BDGEx
```

---

## 2. Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | FastAPI (Python 3.12) + SQLAlchemy async |
| Banco | PostgreSQL 15 (via asyncpg) |
| Auth | JWT (HS256) — Bearer token |
| E-mail | SMTP (configurável via env) |
| Mapas | Leaflet + React-Leaflet |
| Deploy | Docker Compose (nginx reverse proxy) |

---

## 3. Perfis de Usuário

### 3.1 Tabela de Perfis

| Perfil (enum) | Nome legível | Papel no sistema |
|---|---|---|
| `SOLICITANTE` | Solicitante OMDS | Cria e submete pedidos de produtos geoespaciais |
| `SUPERVISOR` | Supervisor C. Mil. A | Revisa e consolida pedidos da sua região (CMilA) |
| `CONSOLIDADOR` | Consolidador (COTER/COLOG) | Agrupa pedidos e os encaminha à DSG |
| `GESTOR_CARTOGRAFICO` | Gestor Cartográfico (DSG) | Distribui pedidos para os CGEOs; exporta relatórios |
| `ANALISTA_CGEO` | Analista CGEO | Analisa viabilidade e registra entrega no BDGEx |

### 3.2 Atributos Obrigatórios por Perfil

| Atributo | SOLICITANTE | SUPERVISOR | CONSOLIDADOR | GESTOR_CARTOGRAFICO | ANALISTA_CGEO |
|---|---|---|---|---|---|
| `om` | OM de lotação | OM (HQ do CMilA) | OM (ex: COTER) | DSG | CGEO |
| `regiao_militar` | Código CMilA (ex: `CMP`) | Código CMilA | Código CMilA | — | — |
| `orgao_vinculante` | COTER / COLOG / etc. | COTER / COLOG / etc. | Próprio órgão | — | — |

**Roteamento de pedidos:**
- O `SUPERVISOR` recebe pedidos filtrando por `regiao_militar` (campo no pedido, herdado do solicitante).
- O `CONSOLIDADOR` recebe pedidos filtrando por `orgao_vinculante` (campo no pedido, herdado do solicitante).
- O `GESTOR_CARTOGRAFICO` vê todos os pedidos com status `AGUARDANDO_CARTOGRAFICO`.
- O `ANALISTA_CGEO` vê pedidos com status `ATRIBUIDO_CGEO` e `cgeo_id == seu id`.

### 3.3 Comandos Militares de Área (CMilA)

| Código | Nome |
|--------|------|
| `CMA` | Comando Militar da Amazônia |
| `CME` | Comando Militar do Leste |
| `CML` | Comando Militar do Leste (variante) |
| `CMN` | Comando Militar do Norte |
| `CMNE` | Comando Militar do Nordeste |
| `CMP` | Comando Militar do Planalto (Brasília) |
| `CMO` | Comando Militar do Oeste |
| `CMS` | Comando Militar do Sul |
| `CMSE` | Comando Militar do Sudeste |

O código CMilA é o valor armazenado no campo `regiao_militar` de `Usuario` e `Pedido`.

### 3.4 Órgãos Vinculantes (OrgaoVinculanteEnum)

| Valor | Descrição |
|-------|-----------|
| `COTER` | Comando de Operações Terrestres |
| `COLOG` | Comando Logístico |
| `DECEx` | Departamento de Educação e Cultura do Exército |
| `DEC` | Departamento de Engenharia e Construção |

---

## 4. Modelo de Dados

### 4.1 Tabela `usuarios`

```sql
CREATE TABLE usuarios (
    id                      SERIAL PRIMARY KEY,
    nome                    VARCHAR(200) NOT NULL,
    email                   VARCHAR(200) UNIQUE NOT NULL,
    telefone                VARCHAR(20),
    secao_om                VARCHAR(200),
    om                      VARCHAR(200) NOT NULL,          -- OM de lotação
    regiao_militar          VARCHAR(20),                    -- Código CMilA (ex: CMP)
    orgao_vinculante        orgao_vinculante_enum,          -- COTER, COLOG, etc.
    perfil                  perfil_enum NOT NULL,           -- SOLICITANTE, SUPERVISOR, etc.
    cgeo_id                 INTEGER,                        -- Apenas ANALISTA_CGEO
    senha_hash              VARCHAR(255) NOT NULL,
    ativo                   BOOLEAN DEFAULT FALSE,
    email_confirmado        BOOLEAN DEFAULT FALSE,
    ultima_senha_alterada   TIMESTAMPTZ,
    ultima_confirmacao_dados TIMESTAMPTZ,
    pedidos_transferidos_em TIMESTAMPTZ,                   -- Marca quando herdou pedidos
    tentativas_login        INTEGER DEFAULT 0,
    bloqueado_ate           TIMESTAMPTZ,
    criado_em               TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em           TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 Tabela `pedidos`

```sql
CREATE TABLE pedidos (
    id                      SERIAL PRIMARY KEY,
    usuario_id              INTEGER REFERENCES usuarios(id),   -- Responsável atual
    criador_id              INTEGER REFERENCES usuarios(id),   -- Criador original (imutável)
    operacao_id             INTEGER REFERENCES operacoes(id),  -- Operação associada (opt.)
    data_entrega            DATE NOT NULL,
    status                  status_pedido_enum NOT NULL,
    prioridade              SMALLINT DEFAULT 0,               -- Menor = maior prioridade
    finalidade              TEXT,
    orgao_vinculante        orgao_vinculante_enum NOT NULL,   -- COTER, COLOG, etc.
    regiao_militar          VARCHAR(20),                      -- CMilA herdado do solicitante
    motivo_reprovacao       TEXT,
    observacoes             TEXT,
    link_bdgex              TEXT,                             -- URL entrega BDGEx
    cgeo_id                 INTEGER,                          -- CGEO responsável
    gestor_cmila_id         INTEGER,                          -- SUPERVISOR que revisou
    gestor_consolidador_id  INTEGER,                          -- CONSOLIDADOR que aprovou
    gestor_cartografico_id  INTEGER,                          -- GESTOR_CARTOGRAFICO que atribuiu
    submetido_gestor_em     TIMESTAMPTZ,
    submetido_dsg_em        TIMESTAMPTZ,
    aprovado_em             TIMESTAMPTZ,
    cancelado_em            TIMESTAMPTZ,
    produzido_em            TIMESTAMPTZ,
    criado_em               TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em           TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.3 Tabela `itens_pedido`

```sql
CREATE TABLE itens_pedido (
    id                        SERIAL PRIMARY KEY,
    pedido_id                 INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
    tipo_produto              tipo_produto_enum NOT NULL,
    escala                    escala_enum NOT NULL,
    inom                      VARCHAR(50) NOT NULL,           -- Articulação INOM
    mi                        VARCHAR(50),                    -- Número MI (quando disponível)
    disponivel_bdgex          BOOLEAN DEFAULT FALSE,
    data_producao_bdgex       DATE,
    solicitar_mesmo_disponivel BOOLEAN DEFAULT FALSE,
    prioridade                SMALLINT DEFAULT 0              -- Ordem de prioridade no pedido
);
```

---

## 5. Ciclo de Vida do Pedido

### 5.1 Diagrama de Status

```
                    ┌─────────────┐
                    │   RASCUNHO  │ ◄── Criado pelo SOLICITANTE
                    └──────┬──────┘
                           │ submit (SOLICITANTE)
                           ▼
               ┌──────────────────────────┐
               │  AGUARDANDO_SUPERVISOR   │ ◄── Aguarda revisão do C. Mil. A
               └──────────┬───────────────┘
                          │ consolidate (SUPERVISOR)
          ┌───────────────┼───────────────┐
          │ reprovar      │ consolidar    │ devolver
          ▼               ▼               ▼
     CANCELADO  AGUARDANDO_CONSOLIDADOR  DEVOLVIDO ──► AGUARDANDO_SUPERVISOR
                          │
                          │ consolidate (CONSOLIDADOR)
                          ▼
              ┌───────────────────────────┐
              │  AGUARDANDO_CARTOGRAFICO  │ ◄── Na fila da DSG
              └───────────┬───────────────┘
                          │ assign_cgeo (GESTOR_CARTOGRAFICO)
                          ▼
                 ┌─────────────────┐
                 │  ATRIBUIDO_CGEO │ ◄── Em análise no CGEO
                 └────────┬────────┘
                          │ cgeo-review: aprovar
                          ▼
                    ┌─────────────┐
                    │   APROVADO  │ ◄── Em atendimento
                    └──────┬──────┘
                           │ cgeo-review: pronto
                           ▼
                    ┌─────────────┐
                    │  PRODUZIDO  │ ◄── Dados no BDGEx
                    └─────────────┘

     REPROVADO ◄── cgeo-review: reprovar (de ATRIBUIDO_CGEO)
```

### 5.2 Transições de Status por Perfil

| De | Para | Quem executa | Endpoint |
|----|------|--------------|----------|
| RASCUNHO | AGUARDANDO_SUPERVISOR | SOLICITANTE | `POST /pedidos/{id}/submit` |
| AGUARDANDO_SUPERVISOR | AGUARDANDO_CONSOLIDADOR | SUPERVISOR | `POST /pedidos/consolidate` |
| AGUARDANDO_SUPERVISOR | DEVOLVIDO | SUPERVISOR | `PUT /pedidos/{id}/review` (acao=editar) |
| AGUARDANDO_SUPERVISOR | CANCELADO | SUPERVISOR | `PUT /pedidos/{id}/review` (acao=reprovar) |
| DEVOLVIDO | AGUARDANDO_SUPERVISOR | SOLICITANTE | `POST /pedidos/{id}/submit` |
| AGUARDANDO_CONSOLIDADOR | AGUARDANDO_CARTOGRAFICO | CONSOLIDADOR | `POST /pedidos/consolidate` |
| AGUARDANDO_CARTOGRAFICO | ATRIBUIDO_CGEO | GESTOR_CARTOGRAFICO | `PUT /pedidos/{id}/assign-cgeo` |
| ATRIBUIDO_CGEO | APROVADO | ANALISTA_CGEO | `PUT /pedidos/{id}/cgeo-review` (acao=aprovar) |
| ATRIBUIDO_CGEO | REPROVADO | ANALISTA_CGEO | `PUT /pedidos/{id}/cgeo-review` (acao=reprovar) |
| APROVADO | PRODUZIDO | ANALISTA_CGEO | `PUT /pedidos/{id}/cgeo-review` (acao=pronto) |

---

## 6. Contratos de API

### 6.1 Autenticação

#### `POST /api/v1/auth/register`
Cria um novo usuário com perfil SOLICITANTE (inativo, aguarda ativação admin).

**Request:**
```json
{
  "nome": "string",
  "email": "string @eb.mil.br",
  "telefone": "string",
  "om": "string",
  "secao_om": "string",
  "regiao_militar": "CMP",
  "orgao_vinculante": "COTER",
  "senha": "string (≥8 chars, maiúscula, minúscula, número, especial)"
}
```

**Response 201:**
```json
{ "message": "Cadastro realizado com sucesso" }
```

**Erros:** 400 — email já cadastrado | email inválido | senha fraca

---

#### `POST /api/v1/auth/login`
Autentica e retorna JWT.

**Request:**
```json
{ "email": "string", "senha": "string" }
```

**Response 200:**
```json
{ "access_token": "string (JWT)" }
```

**Erros:** 401 — credenciais inválidas | 403 — conta bloqueada/inativa/senha expirada

---

### 6.2 Pedidos

#### `POST /api/v1/pedidos/`
Cria pedido em rascunho. Requer perfil SOLICITANTE.

**Request:**
```json
{
  "data_entrega": "YYYY-MM-DD",
  "finalidade": "string (opcional)",
  "operacao_id": null,
  "orgao_vinculante": "COTER",
  "itens": [
    {
      "tipo_produto": "CARTA_TOPOGRAFICA",
      "escala": "1:50.000",
      "inom": "SC-22-Y-A",
      "mi": "2682",
      "solicitar_mesmo_disponivel": false
    }
  ]
}
```

**Response 201:** `PedidoOut` (ver schema §6.7)

---

#### `GET /api/v1/pedidos/`
Lista pedidos visíveis ao usuário atual.

| Perfil | Pedidos retornados |
|--------|-------------------|
| SOLICITANTE | Próprios pedidos |
| SUPERVISOR | Pedidos com `regiao_militar == user.regiao_militar` |
| CONSOLIDADOR | Pedidos com `orgao_vinculante == user.orgao_vinculante` |
| GESTOR_CARTOGRAFICO | Pedidos com status AGUARDANDO_CARTOGRAFICO ou ATRIBUIDO_CGEO |
| ANALISTA_CGEO | Pedidos com `cgeo_id == user.cgeo_id` |

**Response 200:** `PedidoOut[]`

---

#### `GET /api/v1/pedidos/pending`
Lista pedidos aguardando ação do usuário atual.

| Perfil | Status filtrado |
|--------|----------------|
| SUPERVISOR | AGUARDANDO_SUPERVISOR, filtrado por regiao_militar |
| CONSOLIDADOR | AGUARDANDO_CONSOLIDADOR, filtrado por orgao_vinculante |
| GESTOR_CARTOGRAFICO | AGUARDANDO_CARTOGRAFICO |
| ANALISTA_CGEO | ATRIBUIDO_CGEO, filtrado por cgeo_id |

**Response 200:** `PedidoOut[]`

---

#### `POST /api/v1/pedidos/{id}/submit`
Submete pedido em RASCUNHO (ou DEVOLVIDO) para o próximo escalão.

**Response 200:** `PedidoOut`

**Erros:** 400 — pedido já submetido | sem itens | 403 — não é o dono

---

#### `PUT /api/v1/pedidos/{id}/review`
Revisão individual por Supervisor ou Consolidador.

**Request:**
```json
{
  "acao": "aprovar | editar | reprovar",
  "motivo": "string (obrigatório em reprovar)",
  "observacoes": "string (opcional)"
}
```

**Response 200:** `PedidoOut`

---

#### `POST /api/v1/pedidos/consolidate`
Consolida e encaminha lote de pedidos ao próximo escalão.

**Request:**
```json
{ "pedido_ids": [1, 2, 3] }
```

**Response 200:**
```json
{ "submetidos": 3 }
```

**Erros:** 403 — perfil não autorizado

---

#### `GET /api/v1/pedidos/duplicatas`
Retorna grupos de itens duplicados (mesmo INOM + produto + escala em pedidos distintos). Disponível para SUPERVISOR, CONSOLIDADOR, GESTOR_CARTOGRAFICO.

**Response 200:**
```json
[
  {
    "inom": "SC-22-Y-A",
    "mi": "2682",
    "tipo_produto": "CARTA_TOPOGRAFICA",
    "escala": "1:50.000",
    "pedidos": [
      { "id": 1, "usuario_nome": "Sgt Gustavo", "status": "AGUARDANDO_SUPERVISOR" }
    ]
  }
]
```

---

#### `GET /api/v1/pedidos/export`
Exporta ZIP com relatório e GeoJSON. Apenas GESTOR_CARTOGRAFICO.

**Response 200:** `application/zip`

Conteúdo do ZIP:
- `relatorio.txt` — lista de pedidos com atributos em texto
- `pedidos.geojson` — FeatureCollection com geometrias das articulações e atributos (id, solicitante, orgao_vinculante, produto, escala, status)

---

#### `PUT /api/v1/pedidos/reorder`
Reordena pedidos por prioridade (salva índice como `prioridade`).

**Request:**
```json
{ "ordered_ids": [3, 1, 2] }
```

**Response 200:** `{ "ok": true }`

Disponível para: SOLICITANTE, SUPERVISOR, CONSOLIDADOR.

---

#### `PUT /api/v1/pedidos/{id}/items/reorder`
Reordena itens dentro de um pedido por prioridade.

**Request:**
```json
{ "ordered_ids": [12, 10, 11] }
```

**Response 200:** `{ "ok": true }`

---

#### `PUT /api/v1/pedidos/{id}/assign-cgeo`
Atribui pedido a um CGEO. Apenas GESTOR_CARTOGRAFICO.

**Request:**
```json
{ "cgeo_id": 42 }
```

**Response 200:** `PedidoOut`

---

#### `PUT /api/v1/pedidos/{id}/cgeo-review`
Análise do CGEO: aprovar, reprovar ou marcar como pronto (entregue).

**Request:**
```json
{
  "acao": "aprovar | reprovar | pronto",
  "motivo": "string (obrigatório em reprovar)",
  "link_bdgex": "https://... (obrigatório em pronto)"
}
```

**Response 200:** `PedidoOut`

---

### 6.3 Usuários

#### `GET /api/v1/users/me`
Retorna dados do usuário autenticado.

**Response 200:** `UsuarioOut`

---

#### `PUT /api/v1/users/me`
Atualiza telefone e seção. OM e regiao_militar só podem ser alterados após herança executada.

**Request:**
```json
{
  "telefone": "string",
  "secao_om": "string",
  "om": "string (requer herança)",
  "regiao_militar": "string (requer herança)"
}
```

---

#### `GET /api/v1/users/` (admin)
Lista todos os usuários. Apenas GESTOR_CARTOGRAFICO.

---

#### `PUT /api/v1/users/{id}/profile` (admin)
Altera perfil, orgao_vinculante e cgeo_id de um usuário.

**Request:**
```json
{
  "perfil": "SUPERVISOR",
  "orgao_vinculante": "COTER",
  "cgeo_id": null
}
```

---

### 6.4 Janelas de Pedidos

#### `GET /api/v1/janelas/`
Lista janelas de submissão abertas para o perfil do usuário.

#### `POST /api/v1/janelas/` (GESTOR_CARTOGRAFICO)
Cria nova janela de submissão.

**Request:**
```json
{
  "perfil_alvo": "SOLICITANTE",
  "inicio": "2026-01-01T00:00:00Z",
  "fim": "2026-03-31T23:59:59Z",
  "descricao": "string"
}
```

---

### 6.5 Operações Militares

#### `GET /api/v1/operacoes/`
Lista operações disponíveis para o usuário atual.

#### `POST /api/v1/operacoes/` (GESTOR_CARTOGRAFICO)
Cria operação militar.

---

### 6.6 Mapa / Grade INOM

#### `GET /api/v1/map/inom-grid?scale=1:50.000`
Retorna GeoJSON com a grade INOM para a escala informada.

Escalas: `1:25.000`, `1:50.000`, `1:100.000`, `1:250.000`

Para `1:50.000`: retorna shapefile real `asc_mi_50k.shp` com campos `inom` e `mi`.

---

### 6.7 Schema PedidoOut

```typescript
interface PedidoOut {
  id: number
  usuario_id: number
  criador_id: number | null
  operacao_id: number | null
  data_entrega: string          // YYYY-MM-DD
  status: StatusPedido
  prioridade: number            // Menor = mais prioritário
  finalidade: string | null
  orgao_vinculante: string      // COTER, COLOG, etc.
  regiao_militar: string | null // CMP, CMA, etc.
  motivo_reprovacao: string | null
  observacoes: string | null
  link_bdgex: string | null
  criado_em: string             // ISO 8601
  atualizado_em: string
  itens: ItemPedidoOut[]
  // Campos enriquecidos (não estão na tabela, populados no endpoint)
  usuario_nome: string | null
  criador_nome: string | null
  operacao_nome: string | null
}

interface ItemPedidoOut {
  id: number
  tipo_produto: TipoProduto
  escala: Escala
  inom: string
  mi: string | null
  disponivel_bdgex: boolean
  data_producao_bdgex: string | null
  solicitar_mesmo_disponivel: boolean
  prioridade: number
}
```

---

## 7. Mapa de Funções do Backend

### 7.1 `app/services/pedido_service.py`

| Função | Assinatura | Responsabilidade |
|--------|-----------|------------------|
| `submit_pedido` | `(db, pedido, current_user) → Pedido` | Avança pedido de RASCUNHO para o próximo escalão; notifica gestores via e-mail e in-app |
| `review_pedido` | `(db, pedido, gestor, acao, motivo, observacoes) → Pedido` | Revisão individual: aprovar, devolver ou reprovar |
| `consolidate_pedidos` | `(db, pedido_ids, gestor) → dict` | Encaminha lote de pedidos para o próximo escalão |
| `assign_cgeo` | `(db, pedido, cgeo_id, dsg) → Pedido` | Atribui pedido a um CGEO para análise |
| `cgeo_review` | `(db, pedido, cgeo_user, acao, motivo, link_bdgex) → Pedido` | CGEO: aprovar atendimento, reprovar, ou marcar entregue |
| `transferir_pedidos` | `(db, source_user, novo_responsavel, executor) → int` | Transfere pedidos ativos entre usuários da mesma OM |

**Tabelas de roteamento internas:**

```python
# Roteamento na submissão: quem envia → (próximo status, quem notificar)
_SUBMIT_ROUTING = {
    SOLICITANTE:  (AGUARDANDO_SUPERVISOR,   SUPERVISOR),
    SUPERVISOR:   (AGUARDANDO_CONSOLIDADOR, CONSOLIDADOR),
    CONSOLIDADOR: (AGUARDANDO_CARTOGRAFICO, GESTOR_CARTOGRAFICO),
}

# Como encontrar o gestor destinatário:
# SUPERVISOR  → filtra por regiao_militar (campo do pedido)
# CONSOLIDADOR → filtra por orgao_vinculante (campo do pedido)
# GESTOR_CARTOGRAFICO → todos ativos com esse perfil
```

---

### 7.2 `app/services/auth_service.py`

| Função | Assinatura | Responsabilidade |
|--------|-----------|------------------|
| `register_user` | `(db, nome, email, telefone, om, secao_om, senha, regiao_militar, orgao_vinculante) → Usuario` | Cria usuário SOLICITANTE inativo; envia e-mail de boas-vindas |
| `confirm_email` | `(db, token) → Usuario` | Confirma e-mail via token; ativa conta |
| `authenticate_user` | `(db, email, senha, ip) → str (JWT)` | Valida credenciais; aplica controle de tentativas; retorna JWT |
| `request_password_reset` | `(db, email, ip) → None` | Gera token de redefinição (máx. 3/dia); envia por e-mail |
| `reset_password` | `(db, token, nova_senha) → None` | Redefine senha via token válido |

**Políticas de segurança:**
- Máx. 5 tentativas de login → bloqueio de 15 min
- Senha expira em 365 dias
- Token de reset expira em 1 hora
- Token de confirmação expira em 24 horas

---

### 7.3 `app/services/notification_service.py`

| Método | Assinatura | Responsabilidade |
|--------|-----------|------------------|
| `notify_user` | `(usuario_id, titulo, mensagem, pedido_id?) → int` | Cria notificação in-app para um usuário específico |
| `notify_by_perfil` | `(perfil, titulo, mensagem, pedido_id?, regiao_militar?, orgao_vinculante?) → int` | Cria notificações para todos os usuários de um perfil com filtros opcionais |

---

### 7.4 Routers Registrados em `main.py`

| Prefixo | Módulo | Tag |
|---------|--------|-----|
| `/api/v1/auth` | `routers.auth` | Autenticação |
| `/api/v1/users` | `routers.users` | Usuários |
| `/api/v1/pedidos` | `routers.pedidos` | Pedidos |
| `/api/v1/operacoes` | `routers.operacoes` | Operações |
| `/api/v1/janelas` | `routers.janelas` | Janelas |
| `/api/v1/map` | `routers.map_layers` | Mapa/Grade INOM |
| `/api/v1/om-data` | `routers.om_data` | Dados de OMs |
| `/api/v1/historico` | `routers.historico` | Histórico de ações |
| `/api/v1/metricas` | `routers.metricas` | Métricas da API |
| `/api/v1/transferencias` | `routers.transferencias` | Transferência de pedidos |

---

## 8. Mapa de Componentes Frontend

### 8.1 Estrutura de Páginas

```
src/pages/
├── Login.tsx                    — Autenticação JWT
├── Register.tsx                 — Cadastro de solicitante (com orgao_vinculante)
├── Dashboard.tsx                — Painel inicial com cards por perfil
├── Ajuda.tsx                    — Catálogo de produtos e guia de uso
├── MeusPedidos.tsx              — Lista de pedidos do SOLICITANTE (DnD prioridade)
├── SolicitarProdutos.tsx        — Criação de pedido com grade INOM no mapa
├── MeusDados.tsx                — Perfil e herança de pedidos
├── Integracoes.tsx              — Integrações externas
├── gestor/
│   └── GestorDashboard.tsx      — SUPERVISOR e CONSOLIDADOR: revisa, consolida, DnD
├── dsg/
│   ├── DSGDashboard.tsx         — GESTOR_CARTOGRAFICO: atribui CGEOs, exporta ZIP
│   ├── JanelasPedidos.tsx       — Gerencia janelas de submissão
│   └── Relatorios.tsx           — Relatórios e métricas
├── cgeo/
│   └── CGEODashboard.tsx        — ANALISTA_CGEO: analisa viabilidade
└── admin/
    ├── GerenciarUsuarios.tsx    — Ativa/altera perfis de usuários
    ├── AdminPedidos.tsx         — Visão admin de todos os pedidos
    └── ApiMetricas.tsx          — Métricas de uso da API
```

### 8.2 Componentes Compartilhados

| Componente | Arquivo | Responsabilidade |
|-----------|---------|------------------|
| `AppLayout` | `components/layout/AppLayout.tsx` | Layout raiz: Navbar + Sidebar + main |
| `Navbar` | `components/layout/Navbar.tsx` | Barra superior com logo DSG e notificações |
| `Sidebar` | `components/layout/Sidebar.tsx` | Navegação lateral filtrada por perfil |
| `StatusBadge` | `components/shared/StatusBadge.tsx` | Badge colorido para status do pedido |
| `LoadingSpinner` | `components/shared/LoadingSpinner.tsx` | Indicador de carregamento |
| `PedidosMap` | `components/map/PedidosMap.tsx` | Mapa Leaflet com articulações INOM |

### 8.3 Stores (Zustand)

| Store | Arquivo | Estado |
|-------|---------|--------|
| `useAuthStore` | `store/authStore.ts` | `user`, `token`, métodos de autenticação |

**Métodos do authStore:**
```typescript
setUser(user: Usuario): void
setToken(token: string): void
logout(): void
isGestor(): boolean          // true se SUPERVISOR ou CONSOLIDADOR
isDSG(): boolean             // true se GESTOR_CARTOGRAFICO
isCGEO(): boolean            // true se ANALISTA_CGEO
```

### 8.4 Clientes de API

| Módulo | Arquivo | Endpoints cobertos |
|--------|---------|-------------------|
| `authApi` | `api/auth.ts` | register, login, forgotPassword, resetPassword, confirmEmail |
| `pedidosApi` | `api/pedidos.ts` | CRUD completo de pedidos, submit, review, consolidate, reorder, duplicatas, export |
| `operacoesApi` | `api/operacoes.ts` | list, create de operações |
| `usersApi` | `api/users.ts` | me, update, changePassword, admin actions |

---

## 9. Variáveis de Ambiente

### Backend (`.env`)

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `DATABASE_URL` | URL de conexão PostgreSQL async | `postgresql+asyncpg://user:pass@db:5432/sisgeo` |
| `SECRET_KEY` | Chave JWT (mín. 32 chars) | `...` |
| `FRONTEND_URL` | URL do frontend (CORS) | `http://localhost` |
| `ENV` | Ambiente (`development`/`production`) | `production` |
| `SMTP_HOST` | Servidor SMTP | `smtp.eb.mil.br` |
| `SMTP_PORT` | Porta SMTP | `587` |
| `SMTP_USER` | Usuário SMTP | `noreply@eb.mil.br` |
| `SMTP_PASSWORD` | Senha SMTP | `...` |
| `EMAIL_FROM` | Remetente dos e-mails | `SISGEO <noreply@eb.mil.br>` |
| `BDGEX_MOCK` | Habilita usuários de teste | `true` (apenas dev) |
| `BDGEX_URL` | URL da API BDGEx | `https://bdgex.eb.mil.br` |
| `DADOS_PATH` | Caminho para shapefiles | `/app/dados` |

---

## 10. Executar o Sistema

### Desenvolvimento (com rebuild)

```bash
# Parar e remover volumes (reset completo do banco)
docker compose down -v

# Rebuild e subir
docker compose up --build -d

# Ver logs do backend
docker compose logs -f backend

# Rodar script de criação de usuários de hierarquia (opcional)
docker exec coter_backend python /app/scripts/create_hierarchy_users.py
```

### Credenciais padrão (BDGEX_MOCK=true)

| Usuário | E-mail | Senha | Perfil |
|---------|--------|-------|--------|
| Admin DSG | `admin@eb.mil.br` | `Admin@1234` | GESTOR_CARTOGRAFICO |
| Sgt Gustavo | `gustavo@eb.mil.br` | `Gustavo@1234` | SOLICITANTE |
| Cb João | `joao@eb.mil.br` | `Joao@1234` | SOLICITANTE |
| Maj Paulo | `supervisor.cmilA@eb.mil.br` | `Supervisor@1234` | SUPERVISOR (CMP/COTER) |
| TC Carlos | `consolidador.coter@eb.mil.br` | `Consolidador@1234` | CONSOLIDADOR (COTER) |
| Cap Ricardo | `analista.cgeo@eb.mil.br` | `AnalistaCGEO@1234` | ANALISTA_CGEO |

### Requisitos de Infraestrutura (Debian)

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disco (SO + app) | 20 GB | 40 GB |
| Disco (dados/shapefiles) | 10 GB | 50 GB (para crescimento) |
| Rede | 10 Mbps | 100 Mbps |
| Porta externa | 80 (HTTP) / 443 (HTTPS) | HTTPS com certificado |

---

## 11. Produtos Geoespaciais

| Produto | Enum | Escalas disponíveis | Prazo médio |
|---------|------|---------------------|-------------|
| Carta Topográfica | `CARTA_TOPOGRAFICA` | 25k, 50k, 100k, 250k | 180 dias |
| Carta Ortoimagem | `CARTA_ORTOIMAGEM` | 25k, 50k, 100k, 250k | 180 dias |
| Ortoimagem | `ORTOIMAGEM` | 25k, 50k, 100k, 250k | 120 dias |
| Modelo Digital de Terreno | `MDT` | 25k, 50k, 100k, 250k | 120 dias |
| Modelo Digital de Superfície | `MDS` | 25k, 50k, 100k, 250k | 120 dias |
| Conjunto de Dados Geoespaciais Vetoriais | `CDGV` | 25k, 50k, 100k, 250k | 240 dias |
| Impressão de Produto Geoespacial | `IMPRESSAO` | 25k, 50k, 100k, 250k | 30 dias |

---

## 12. Rastreabilidade e Auditoria

Cada ação sobre um pedido é registrada na tabela `historico_pedidos`:

```sql
CREATE TABLE historico_pedidos (
    id          SERIAL PRIMARY KEY,
    pedido_id   INTEGER REFERENCES pedidos(id),
    usuario_id  INTEGER REFERENCES usuarios(id),
    acao        VARCHAR(50),           -- "submeter", "aprovar", "reprovar", etc.
    status_de   VARCHAR(50),
    status_para VARCHAR(50),
    motivo      TEXT,
    criado_em   TIMESTAMPTZ DEFAULT NOW()
);
```

Transferências entre usuários são registradas na tabela `pedido_transferencias`:

```sql
CREATE TABLE pedido_transferencias (
    id               SERIAL PRIMARY KEY,
    pedido_id        INTEGER REFERENCES pedidos(id),
    de_usuario_id    INTEGER REFERENCES usuarios(id),
    para_usuario_id  INTEGER REFERENCES usuarios(id),
    executor_id      INTEGER REFERENCES usuarios(id),
    observacao       TEXT,
    transferido_em   TIMESTAMPTZ DEFAULT NOW()
);
```

---

*Documento gerado em 2026-05-19. Manter atualizado a cada mudança de contrato ou fluxo.*
