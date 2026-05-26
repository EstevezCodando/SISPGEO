# SisPGeo — Arquitetura de Dados e Relacionamentos

> **Sistema de Pedidos de Geoinformação**  
> Diretoria de Serviço Geográfico — Exército Brasileiro  
> Stack: FastAPI + async SQLAlchemy (PostgreSQL/PostGIS) · React + TypeScript + Zustand

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Enumerações (Domínios de Valor)](#2-enumerações-domínios-de-valor)
3. [Modelos ORM — Backend](#3-modelos-orm--backend)
4. [Schemas Pydantic — Backend](#4-schemas-pydantic--backend)
5. [Types TypeScript — Frontend](#5-types-typescript--frontend)
6. [Stores Zustand — Frontend](#6-stores-zustand--frontend)
7. [Relacionamentos e Chaves Estrangeiras](#7-relacionamentos-e-chaves-estrangeiras)
8. [Fluxo de Status do Pedido](#8-fluxo-de-status-do-pedido)
9. [Cadeia de Aprovação por Órgão Vinculante](#9-cadeia-de-aprovação-por-órgão-vinculante)
10. [Hierarquia de Perfis e Roteamento](#10-hierarquia-de-perfis-e-roteamento)

---

## 1. Visão Geral

O SisPGeo gerencia a solicitação, aprovação, produção e entrega de **produtos de
geoinformação** (cartas topográficas, ortoimagens, MDT/MDS, impressões, CDGV)
produzidos pelo BDGEx/DSG.

### Entidades principais

```
Usuario ──(1:N)──► Pedido ──(1:N)──► ItemPedido
                      │
           ┌──────────┼──────────┐
           │          │          │
        Operacao  AuditLog  PedidoHistorico
                               │
                        PedidoTransferencia
```

### Tabelas do banco

| Tabela                  | Propósito                                             |
| ----------------------- | ----------------------------------------------------- |
| `usuarios`              | Autenticação, perfil, OM, contatos                    |
| `tokens_senha`          | Reset de senha e ativação de conta por e-mail         |
| `pedidos`               | Cabeçalho do pedido e cadeia de aprovação             |
| `itens_pedido`          | Células/folhas solicitadas (1 item = 1 INOM)          |
| `operacoes`             | Agrupador de pedidos por operação militar             |
| `janelas_pedidos`       | Controle de períodos em que solicitações são aceitas  |
| `notificacoes`          | Notificações in-app por usuário                       |
| `audit_logs`            | Rastreio imutável de ações sobre pedidos              |
| `pedido_historico`      | Histórico imutável de transições de status            |
| `pedido_transferencias` | Rastreio de transferências de responsabilidade        |
| `api_metricas`          | Métricas de performance por endpoint                  |
| `bdgex_cache`           | Cache de disponibilidade BDGEx com geometria PostGIS  |
| `oms_customizadas`      | OMs cadastradas manualmente (não constam no SIAPE)    |
| `config_entrega`        | Singleton de configuração de datas mínimas de entrega |

---

## 2. Enumerações (Domínios de Valor)

### `PerfilEnum` — Hierarquia de acesso

| Valor                     | Descrição                              | Grupo             |
| ------------------------- | -------------------------------------- | ----------------- |
| `SOLICITANTE`             | Usuário de OM demandante               | Solicitantes      |
| `SUPERVISOR_CMP`          | SSGeoInt — C Mil Planalto              | Supervisores (RM) |
| `SUPERVISOR_CML`          | SSGeoInt — C Mil Leste                 | Supervisores (RM) |
| `SUPERVISOR_CMS`          | SSGeoInt — C Mil Sul                   | Supervisores (RM) |
| `SUPERVISOR_CMO`          | SSGeoInt — C Mil Oeste                 | Supervisores (RM) |
| `SUPERVISOR_CMAO`         | SSGeoInt — C Mil Amazônia Oriental     | Supervisores (RM) |
| `SUPERVISOR_CMA`          | SSGeoInt — C Mil Amazônia              | Supervisores (RM) |
| `SUPERVISOR_CMNOR`        | SSGeoInt — C Mil Nordeste              | Supervisores (RM) |
| `SUPERVISOR_CMSE`         | SSGeoInt — C Mil Sudeste               | Supervisores (RM) |
| `CONSOLIDADOR_COTER`      | Seção Geo do COTER                     | Consolidadores    |
| `CONSOLIDADOR_DSG`        | DSG — consolidação interna             | Consolidadores    |
| `CONSOLIDADOR_DEC`        | DEC — consolidação                     | Consolidadores    |
| `CONSOLIDADOR_COLOG`      | COLOG — consolidação                   | Consolidadores    |
| `CONSOLIDADOR_DECEX`      | DECEx — consolidação                   | Consolidadores    |
| `GESTOR_CARTOGRAFICO`     | DSG — define CGEO e valida viabilidade | Gestores DSG      |
| `ANALISTA_CGEO`           | CGEO — atende e entrega pedidos        | Gestores DSG      |
| `SUPERVISOR` _(legado)_   | Supervisor sem CMilA específico        | Legados           |
| `CONSOLIDADOR` _(legado)_ | Consolidador genérico                  | Legados           |

**Sets de conveniência (backend + frontend):**

- `SUPERVISOR_PROFILES` — todos os `SUPERVISOR_*` + `SUPERVISOR` legado
- `CONSOLIDADOR_PROFILES` — todos os `CONSOLIDADOR_*` + `CONSOLIDADOR` legado

### `OrgaoVinculanteEnum` — Órgão do solicitante

| Valor   | Descrição                          | Roteamento do pedido          |
| ------- | ---------------------------------- | ----------------------------- |
| `COTER` | Comando de Operações Terrestres    | → Supervisor do CMilA         |
| `DSG`   | Diretoria de Serviço Geográfico    | → Consolidador DSG (direto)   |
| `DEC`   | Diretoria de Educação e Cultura    | → Consolidador DEC (direto)   |
| `COLOG` | Comando Logístico                  | → Consolidador COLOG (direto) |
| `DECEx` | Departamento de Educação e Cultura | → Consolidador DECEx (direto) |
| `DCT`   | Departamento C&T _(banco only)_    | Não exibido no cadastro       |

### `StatusPedidoEnum` — Ciclo de vida do pedido

| Valor                     | Significado                                 |
| ------------------------- | ------------------------------------------- |
| `RASCUNHO`                | Criado, não enviado para revisão            |
| `AGUARDANDO_SUPERVISOR`   | Aguardando aprovação do supervisor do CMilA |
| `AGUARDANDO_CONSOLIDADOR` | Aguardando consolidação pelo órgão          |

| `AGUARDANDO_CARTOGRAFICO` | Aguardando atribuição a CGEO pelo Gestor DSG |
| `ATRIBUIDO_CGEO` | CGEO designado, análise em andamento |
| `APROVADO` | Aprovado, em produção pelo CGEO |
| `REPROVADO` | Inviável — produção impossível |
| `CANCELADO` | Cancelado pelo solicitante ou gestor |
| `PRODUZIDO` | Produto entregue — dados disponíveis no BDGEx |

### `TipoProdutoEnum` — Produtos geoespaciais

| Valor               | Descrição                                | É impressão? |
| ------------------- | ---------------------------------------- | :----------: |
| `CARTA_TOPOGRAFICA` | Carta Topográfica digital                |     Não      |
| `CARTA_ORTOIMAGEM`  | Carta Ortoimagem digital                 |     Não      |
| `ORTOIMAGEM`        | Imagem ortorretificada                   |     Não      |
| `MDT`               | Modelo Digital de Terreno                |     Não      |
| `MDS`               | Modelo Digital de Superfície             |     Não      |
| `CDGV`              | Conjunto de Dados Geoespaciais Vetoriais |     Não      |
| `IMPRESSAO_CT`      | Impressão de Carta Topográfica           |   **Sim**    |
| `IMPRESSAO_COI`     | Impressão de Carta Ortoimagem            |   **Sim**    |
| `IMPRESSAO`         | Impressão Geoespacial _(legado)_         |   **Sim**    |

`TIPOS_IMPRESSAO = { IMPRESSAO_CT, IMPRESSAO_COI, IMPRESSAO }` — set usado para
bifurcar lógica de UX (campos quantidade + material obrigatórios por item).

### `EscalaEnum`

`1:25.000` · `1:50.000` · `1:100.000` · `1:250.000`

### `PostoGraduacaoEnum`

18 valores representando praças e oficiais do Exército (Gen Ex → Sd).
Exibido como prefixo do nome do usuário na interface.

### `MaterialImpressao` (frontend only)

`'Canvas'` · `'Sulfite'` · `'Glossy'` · `'Tyvek'`
Tipo de suporte físico para impressão. Armazenado como `String(20)` no banco.

---

## 3. Modelos ORM — Backend

### `Usuario` — tabela `usuarios`

| Coluna                     | Tipo           | Descrição                                               |
| -------------------------- | -------------- | ------------------------------------------------------- |
| `id`                       | Integer PK     | Identificador único auto-incremento                     |
| `nome`                     | String(150)    | Nome completo                                           |
| `email`                    | String(150) UQ | E-mail institucional (@eb.mil.br) — chave de login      |
| `senha_hash`               | String(200)    | Bcrypt hash — **nunca exposto pela API**                |
| `om`                       | String(100)    | Organização Militar (sigla ou nome)                     |
| `secao_om`                 | String(100)?   | Seção dentro da OM                                      |
| `telefone`                 | String(30)?    | Telefone convencional                                   |
| `telefone_ritex`           | String(30)?    | Ramal RITEX (rede interna EB)                           |
| `posto_graduacao`          | SAEnum?        | Posto/Graduação — `PostoGraduacaoEnum`                  |
| `perfil`                   | SAEnum         | Nível de acesso — `PerfilEnum`                          |
| `orgao_vinculante`         | SAEnum?        | Órgão superior — `OrgaoVinculanteEnum`                  |
| `regiao_militar`           | String(20)?    | CMilA da OM (CMP, CML, CMS…) — roteamento ao supervisor |
| `cgeo_id`                  | Integer?       | ID do CGEO ao qual este usuário está vinculado          |
| `ativo`                    | Boolean        | Conta ativa (admin ou auto-ativação via e-mail)         |
| `email_confirmado`         | Boolean        | E-mail confirmado via link de ativação                  |
| `tentativas_login`         | SmallInt       | Contador de tentativas falhas (reset ao logar)          |
| `bloqueado_ate`            | DateTime?      | Bloqueio temporário por força bruta                     |
| `ultima_senha_alterada`    | DateTime?      | Timestamp da última alteração de senha                  |
| `ultima_confirmacao_dados` | DateTime?      | Última vez que o usuário confirmou seus dados           |
| `pedidos_transferidos_em`  | DateTime?      | Data da última transferência de pedidos (bulk)          |
| `criado_em`                | DateTime       | Timestamp de criação (server_default)                   |
| `atualizado_em`            | DateTime       | Timestamp de última atualização (onupdate)              |

**Índices:** `email` (unique), `perfil`, `ativo+email_confirmado`.

---

### `TokenSenha` — tabela `tokens_senha`

Tabela polimórfica: serve tanto para **reset de senha** quanto para
**ativação de conta** por e-mail.

| Coluna       | Tipo       | Descrição                                        |
| ------------ | ---------- | ------------------------------------------------ |
| `id`         | Integer PK |                                                  |
| `usuario_id` | Integer FK | → `usuarios.id`                                  |
| `token`      | String UQ  | Token aleatório seguro (`secrets.token_urlsafe`) |
| `expira_em`  | DateTime   | Expiração UTC (24h ativação, 1h reset)           |
| `usado_em`   | DateTime?  | Preenchido ao consumir o token (idempotência)    |

---

### `Pedido` — tabela `pedidos`

| Coluna                    | Tipo        | Descrição                                               |
| ------------------------- | ----------- | ------------------------------------------------------- |
| `id`                      | Integer PK  |                                                         |
| `usuario_id`              | Integer FK  | → `usuarios.id` — **responsável atual** (mutável)       |
| `criador_id`              | Integer FK? | → `usuarios.id` — criador original (**imutável**)       |
| `operacao_id`             | Integer FK? | → `operacoes.id` — agrupamento opcional                 |
| `data_entrega`            | Date        | Data sugerida de entrega pelo solicitante               |
| `status`                  | SAEnum      | Estado atual — `StatusPedidoEnum`                       |
| `prioridade`              | SmallInt    | Ordem de exibição/atendimento (0 = padrão)              |
| `finalidade`              | Text?       | Objetivo do pedido (obrigatório quando `operacao=null`) |
| `orgao_vinculante`        | SAEnum      | Determina cadeia de aprovação — `OrgaoVinculanteEnum`   |
| `regiao_militar`          | String(20)? | CMilA do solicitante — roteia ao supervisor correto     |
| `gestor_demandante_id`    | Integer FK? | → `usuarios.id` — supervisor que aprovou                |
| `gestor_dsg_id`           | Integer FK? | → `usuarios.id` — consolidador/gestor DSG que aprovou   |
| `cgeo_id`                 | Integer?    | ID do CGEO (sem FK — evita ambiguidade async)           |
| `motivo_reprovacao`       | Text?       | Justificativa de reprovação/cancelamento                |
| `observacoes`             | Text?       | Observações do gestor ao entregar                       |
| `link_bdgex`              | Text?       | URL do produto no BDGEx                                 |
| `auto_submitted`          | Boolean     | True se submetido automaticamente pelo sistema          |
| `impressao_solicitada`    | Boolean     | Derivado: `true` se qualquer item tem impressão         |
| `impressao_quantidade`    | SmallInt?   | Campo legado global (substituído por per-item)          |
| `impressao_tipo_material` | String(20)? | Campo legado global (substituído por per-item)          |
| `submetido_gestor_em`     | DateTime?   | Timestamp ao entrar em `AGUARDANDO_SUPERVISOR`          |
| `submetido_dsg_em`        | DateTime?   | Timestamp ao entrar em `AGUARDANDO_CONSOLIDADOR`        |
| `aprovado_em`             | DateTime?   | Timestamp ao atingir `APROVADO`                         |
| `produzido_em`            | DateTime?   | Timestamp ao atingir `PRODUZIDO`                        |
| `cancelado_em`            | DateTime?   | Timestamp ao atingir `CANCELADO` ou `REPROVADO`         |
| `criado_em`               | DateTime    | Criação (server_default)                                |
| `atualizado_em`           | DateTime    | Última atualização (onupdate)                           |

**Relacionamento:** `itens` → `ItemPedido[]` com `lazy="selectin"` (carregado
automaticamente nas queries async).

---

### `ItemPedido` — tabela `itens_pedido`

Cada registro representa **uma folha/célula** do índice cartográfico.

| Coluna                       | Tipo        | Descrição                                                 |
| ---------------------------- | ----------- | --------------------------------------------------------- |
| `id`                         | Integer PK  |                                                           |
| `pedido_id`                  | Integer FK  | → `pedidos.id` CASCADE DELETE                             |
| `tipo_produto`               | SAEnum      | Produto solicitado — `TipoProdutoEnum`                    |
| `escala`                     | SAEnum      | Escala cartográfica — `EscalaEnum`                        |
| `inom`                       | String(50)  | Índice de Nomenclatura (ex: SF-22-X-D-IV)                 |
| `mi`                         | String(50)? | Número MI — identificador alternativo                     |
| `geom`                       | Geometry?   | Polígono da folha WGS-84 SRID 4326 (PostGIS)              |
| `disponivel_bdgex`           | Boolean     | Produto existe no BDGEx no momento do pedido              |
| `data_producao_bdgex`        | Date?       | Data de produção do dado no BDGEx                         |
| `solicitar_mesmo_disponivel` | Boolean     | Forçar produção mesmo que já disponível                   |
| `prioridade`                 | SmallInt    | Ordem de atendimento dentro do pedido                     |
| `impressao_quantidade`       | SmallInt?   | Cópias para **este item** (per-item)                      |
| `impressao_tipo_material`    | String(20)? | Material para **este item** (Canvas/Sulfite/Glossy/Tyvek) |
| `criado_em`                  | DateTime    | Criação                                                   |

> **Princípio de separação de responsabilidade:** `impressao_quantidade` e
> `impressao_tipo_material` pertencem ao `ItemPedido`, não ao `Pedido`.
> Cada folha tem sua configuração de impressão independente.
> `Pedido.impressao_solicitada` é **derivado**:
> `any(i.impressao_quantidade for i in itens if i.impressao_quantidade)`.

---

### `Operacao` — tabela `operacoes`

Agrupa pedidos de uma mesma operação militar.

| Coluna       | Tipo        | Descrição        |
| ------------ | ----------- | ---------------- |
| `id`         | Integer PK  |                  |
| `nome`       | String(100) | Nome da operação |
| `om`         | String(100) | OM responsável   |
| `criado_por` | Integer FK  | → `usuarios.id`  |
| `criado_em`  | DateTime    |                  |

---

### `JanelaPedidos` — tabela `janelas_pedidos`

Controla o período em que solicitações são aceitas para cada perfil/tipo.

| Coluna          | Tipo       | Descrição                                    |
| --------------- | ---------- | -------------------------------------------- |
| `id`            | Integer PK |                                              |
| `tipo_janela`   | SAEnum     | `TipoJanelaEnum` — a qual perfil se aplica   |
| `data_inicio`   | DateTime   | Início do período                            |
| `data_fim`      | DateTime   | Fim do período                               |
| `criado_por`    | Integer FK | → `usuarios.id` (admin que criou)            |
| `criado_em`     | DateTime   |                                              |
| `atualizado_em` | DateTime   |                                              |
| `configurada`   | Boolean    | Se há janela configurada (vs. padrão aberta) |

---

### `Notificacao` — tabela `notificacoes`

| Coluna       | Tipo        | Descrição                          |
| ------------ | ----------- | ---------------------------------- |
| `id`         | Integer PK  |                                    |
| `usuario_id` | Integer FK  | → `usuarios.id` — destinatário     |
| `titulo`     | String      | Cabeçalho da notificação           |
| `mensagem`   | Text        | Corpo                              |
| `lida`       | Boolean     | Estado de leitura                  |
| `pedido_id`  | Integer FK? | → `pedidos.id` — contexto opcional |
| `criado_em`  | DateTime    |                                    |

---

### `AuditLog` — tabela `audit_logs`

Rastreio imutável de todas as ações sobre pedidos.

| Coluna       | Tipo       | Descrição                                       |
| ------------ | ---------- | ----------------------------------------------- |
| `id`         | Integer PK |                                                 |
| `pedido_id`  | Integer FK | → `pedidos.id`                                  |
| `usuario_id` | Integer FK | → `usuarios.id` — quem executou                 |
| `acao`       | String     | Identificador da ação (submit, review, cancel…) |
| `detalhe`    | Text?      | JSON ou texto livre com contexto                |
| `ip`         | String?    | IP de origem da requisição                      |
| `user_agent` | String?    | Browser/cliente                                 |
| `criado_em`  | DateTime   |                                                 |

---

### `PedidoHistorico` — tabela `pedido_historico`

Registra cada transição de status com contexto completo.

| Coluna            | Tipo       | Descrição                                           |
| ----------------- | ---------- | --------------------------------------------------- |
| `id`              | Integer PK |                                                     |
| `pedido_id`       | Integer FK | → `pedidos.id`                                      |
| `usuario_id`      | Integer FK | → `usuarios.id` — quem acionou a transição          |
| `status_anterior` | SAEnum?    | Status antes da transição                           |
| `status_novo`     | SAEnum     | Status após a transição                             |
| `acao`            | String     | Ação executada (submit, aprovar, reprovar, pronto…) |
| `motivo`          | Text?      | Justificativa informada                             |
| `observacoes`     | Text?      | Observações adicionais                              |
| `ip`              | String?    | IP de origem                                        |
| `criado_em`       | DateTime   | Timestamp da transição                              |

---

### `PedidoTransferencia` — tabela `pedido_transferencias`

Rastreia transferências de responsabilidade entre usuários.

| Coluna             | Tipo       | Descrição                                       |
| ------------------ | ---------- | ----------------------------------------------- |
| `id`               | Integer PK |                                                 |
| `pedido_id`        | Integer FK | → `pedidos.id`                                  |
| `de_usuario_id`    | Integer FK | → `usuarios.id` — responsável anterior          |
| `para_usuario_id`  | Integer FK | → `usuarios.id` — novo responsável              |
| `executado_por_id` | Integer FK | → `usuarios.id` — quem executou a transferência |
| `motivo`           | Text?      |                                                 |
| `criado_em`        | DateTime   |                                                 |

---

### `BdgexCache` — tabela `bdgex_cache`

Cache de disponibilidade de folhas cartográficas no BDGEx.

| Coluna          | Tipo       | Descrição                                     |
| --------------- | ---------- | --------------------------------------------- |
| `id`            | Integer PK |                                               |
| `inom`          | String UQ  | Índice único de nomenclatura da folha         |
| `escala`        | SAEnum     | Escala da folha                               |
| `tipo_produto`  | SAEnum     | Tipo de produto                               |
| `disponivel`    | Boolean    | Produto disponível no BDGEx                   |
| `data_producao` | Date?      | Data de produção no BDGEx                     |
| `geom`          | Geometry?  | Polígono da folha (PostGIS POLYGON SRID 4326) |
| `atualizado_em` | DateTime   | Última sincronização com BDGEx                |

---

### `ConfigEntrega` — tabela `config_entrega` (singleton `id=1`)

| Coluna           | Tipo       | Descrição                                      |
| ---------------- | ---------- | ---------------------------------------------- |
| `id`             | Integer PK | Sempre `id=1` — singleton                      |
| `data_base`      | Date       | Data base para cálculo dos prazos mínimos      |
| `prazos_minimos` | JSON       | `{ TipoProduto: dias }` — override por produto |
| `atualizado_em`  | DateTime   |                                                |

---

## 4. Schemas Pydantic — Backend

### Schemas de criação/envio (Request)

#### `ItemPedidoCreate`

```
tipo_produto                TipoProdutoEnum
escala                      EscalaEnum
inom                        str
mi                          str | None
solicitar_mesmo_disponivel  bool = False
impressao_quantidade        int | None     ← config de impressão deste item
impressao_tipo_material     str | None     ← material para este item
```

#### `PedidoCreate`

```
operacao_id                 int | None
data_entrega                date
finalidade                  str | None
orgao_vinculante            OrgaoVinculanteEnum | None
itens                       list[ItemPedidoCreate]
impressao_solicitada        bool = False   ← derivado dos itens no backend
```

#### `ReviewPedidoRequest`

```
acao        Literal["aprovar", "editar", "reprovar"]
motivo      str | None
observacoes str | None
```

#### `CGEOReviewRequest`

```
acao        Literal["aprovar", "reprovar", "pronto"]
motivo      str | None
link_bdgex  str | None
```

### Schemas de resposta (Response)

#### `ItemPedidoOut`

```
id                          int
tipo_produto                TipoProdutoEnum
escala                      EscalaEnum
inom                        str
mi                          str | None
disponivel_bdgex            bool
data_producao_bdgex         date | None
solicitar_mesmo_disponivel  bool
prioridade                  int
impressao_quantidade        int | None     ← por item
impressao_tipo_material     str | None     ← por item
```

#### `PedidoOut`

```
id                          int
usuario_id                  int            ← responsável atual
operacao_id                 int | None
data_entrega                date
status                      StatusPedidoEnum
prioridade                  int
finalidade                  str | None
orgao_vinculante            OrgaoVinculanteEnum
motivo_reprovacao           str | None
observacoes                 str | None
link_bdgex                  str | None
criado_em                   datetime
atualizado_em               datetime
itens                       list[ItemPedidoOut]
regiao_militar              str | None
# Campos enriquecidos (não ORM — populados nos endpoints via _enrich())
usuario_nome                str | None     ← JOIN usuarios
operacao_nome               str | None     ← JOIN operacoes
criador_id                  int | None     ← criador original
criador_nome                str | None
auto_submitted              bool
usuario_om                  str | None     ← contatos do solicitante
usuario_email               str | None
usuario_telefone            str | None
usuario_telefone_ritex      str | None
usuario_secao_om            str | None
usuario_perfil              str | None
impressao_solicitada        bool
cadeia_aprovacao            list[str]      ← calculado dinamicamente
```

---

## 5. Types TypeScript — Frontend

### `ItemImpressao` — configuração de impressão por item

Entidade independente separada do `CartItem` por **Single Responsibility**.
Cada `CartItem` pode ter no máximo uma `ItemImpressao` associada (1:1).

```typescript
interface ItemImpressao {
  id: string; // == cartKey(item) — chave idêntica a produtoId
  produtoId: string; // FK → CartItem via cartKey()
  quantidade: number; // cópias solicitadas (mín. 1)
  tipo: MaterialImpressao; // 'Canvas' | 'Sulfite' | 'Glossy' | 'Tyvek'
}
```

O `id` ser igual ao `cartKey` elimina lookup reverso (relação 1:1 garantida).

**Extensibilidade (Open/Closed):** para adicionar `tamanho` (A0/A1), `acabamento`,
`laminacao`, basta estender esta interface sem alterar `CartItem`.

---

### `CartItem` — produto no carrinho (pré-submissão)

```typescript
interface CartItem {
  inom: string; // Índice de Nomenclatura da Folha
  mi: string | null; // Número MI (identificador alternativo)
  tipo_produto: TipoProduto; // Tipo do produto geoespacial
  escala: Escala; // Escala cartográfica
  solicitar_mesmo_disponivel: boolean; // Forçar mesmo com dado disponível
  disponivel_bdgex: boolean; // Cache local — disponível no BDGEx?
  geom?: object; // Geometria GeoJSON (preview no mapa)
  impressao: boolean; // Flag: impressão solicitada
  impressaoId: string | null; // FK → ItemImpressao.id (null se !impressao)
}
```

**Relacionamento com `ItemImpressao`:** `impressaoId = cartKey(item)` quando
`impressao=true`. O store mantém o mapa `impressoes: Record<string, ItemImpressao>`.

---

### `ItemPedido` — item persistido (pós-submissão, resposta da API)

```typescript
interface ItemPedido {
  id: number;
  tipo_produto: TipoProduto;
  escala: Escala;
  inom: string;
  mi: string | null;
  disponivel_bdgex: boolean;
  data_producao_bdgex: string | null;
  solicitar_mesmo_disponivel: boolean;
  prioridade: number;
  impressao_quantidade: number | null; // per-item — mesma semântica de CartItem
  impressao_tipo_material: string | null;
}
```

---

### `Pedido` — resposta completa da API (cabeçalho + itens + enriquecimentos)

```typescript
interface Pedido {
  id: number;
  usuario_id: number; // Responsável atual (mutável após transferência)
  operacao_id: number | null;
  data_entrega: string; // ISO date YYYY-MM-DD
  status: StatusPedido;
  prioridade: number;
  finalidade: string | null;
  orgao_vinculante: string;
  motivo_reprovacao: string | null;
  observacoes: string | null;
  link_bdgex: string | null;
  criado_em: string; // ISO datetime
  atualizado_em: string;
  itens: ItemPedido[];
  regiao_militar: string | null;
  // Enriquecidos (JOINs resolvidos no backend)
  usuario_nome: string | null;
  operacao_nome: string | null;
  criador_id: number | null; // Criador original (imutável mesmo após transferência)
  criador_nome: string | null;
  cgeo_id?: number | null;
  auto_submitted?: boolean;
  usuario_om?: string | null;
  usuario_email?: string | null;
  usuario_telefone?: string | null;
  usuario_telefone_ritex?: string | null;
  usuario_secao_om?: string | null;
  usuario_perfil?: string | null;
  cadeia_aprovacao: string[]; // Labels calculados da cadeia de aprovação
  impressao_solicitada?: boolean;
}
```

---

### `Usuario` — sessão autenticada

```typescript
interface Usuario {
  id: number;
  nome: string;
  email: string; // @eb.mil.br
  telefone: string | null;
  telefone_ritex: string | null;
  secao_om: string | null;
  om: string;
  regiao_militar: string | null; // CMilA: CMP, CML, CMS, CMO, CMAO, CMA, CMNOR, CMSE
  posto_graduacao: string | null;
  perfil: Perfil;
  orgao_vinculante: OrgaoVinculante | null;
  cgeo_id: number | null;
  ativo: boolean;
  email_confirmado: boolean;
  ultima_senha_alterada: string | null;
  ultima_confirmacao_dados: string | null;
  pedidos_transferidos_em: string | null;
  tentativas_login: number;
  bloqueado_ate: string | null;
  criado_em: string;
  atualizado_em: string;
}
```

---

## 6. Stores Zustand — Frontend

### `cartStore` — estado do carrinho de solicitação

```typescript
CartState {
  // Seleções do formulário (globais ao carrinho)
  tipoProduto: TipoProduto | null
  escala: Escala | null
  dataEntrega: string | null
  operacaoId: number | null
  finalidade: string
  // Coleções
  items: CartItem[]
  impressoes: Record<string, ItemImpressao>  // chave = cartKey(item)
}
```

**Ações:**

| Ação                               | Descrição                                                      |
| ---------------------------------- | -------------------------------------------------------------- |
| `addItem(item)`                    | Adiciona ao carrinho com `impressao=false`, `impressaoId=null` |
| `removeItem(inom, tipo, escala)`   | Remove item e limpa entidades de impressão órfãs               |
| `hasItem(inom, tipo?, escala?)`    | Verifica presença no carrinho                                  |
| `setItemImpressao(key, qty, tipo)` | Cria/atualiza `ItemImpressao`; marca `item.impressao=true`     |
| `removeItemImpressao(key)`         | Remove `ItemImpressao`; limpa `item.impressao=false`           |
| `clear()`                          | Zera todo o estado após submissão                              |

**`cartKey(item)`** — função pura, chave única no carrinho:

```
"${tipo_produto}|||${escala}|||${inom}"
```

Permite o mesmo INOM em produtos/escalas distintos coexistir no carrinho.

---

### `authStore` — sessão do usuário

```typescript
AuthState {
  user: Usuario | null
  token: string | null    // persiste em localStorage
}
```

**Predicados de acesso:**

| Método       | Condição                                               |
| ------------ | ------------------------------------------------------ |
| `isGestor()` | `perfil ∈ SUPERVISOR_PROFILES ∪ CONSOLIDADOR_PROFILES` |
| `isDSG()`    | `perfil === 'GESTOR_CARTOGRAFICO'`                     |
| `isCGEO()`   | `perfil === 'ANALISTA_CGEO'`                           |

---

## 7. Relacionamentos e Chaves Estrangeiras

```
usuarios (1) ──────────────────────► (N) pedidos.usuario_id         [responsável atual]
usuarios (1) ──────────────────────► (N) pedidos.criador_id         [criador imutável]
usuarios (1) ──────────────────────► (N) pedidos.gestor_demandante_id
usuarios (1) ──────────────────────► (N) pedidos.gestor_dsg_id
usuarios (1) ──────────────────────► (N) operacoes.criado_por
usuarios (1) ──────────────────────► (N) notificacoes.usuario_id
usuarios (1) ──────────────────────► (N) audit_logs.usuario_id
usuarios (1) ──────────────────────► (N) pedido_historico.usuario_id
usuarios (1) ──────────────────────► (N) tokens_senha.usuario_id
usuarios (1) ──────────────────────► (N) pedido_transferencias.de_usuario_id
usuarios (1) ──────────────────────► (N) pedido_transferencias.para_usuario_id
usuarios (1) ──────────────────────► (N) pedido_transferencias.executado_por_id

operacoes (1) ─────────────────────► (N) pedidos.operacao_id        [nullable]

pedidos (1) ────────────────────────► (N) itens_pedido.pedido_id    [CASCADE DELETE]
pedidos (1) ────────────────────────► (N) notificacoes.pedido_id    [nullable]
pedidos (1) ────────────────────────► (N) audit_logs.pedido_id
pedidos (1) ────────────────────────► (N) pedido_historico.pedido_id
pedidos (1) ────────────────────────► (N) pedido_transferencias.pedido_id
```

### `usuario_id` vs `criador_id`

| Campo        | Muda após transferência? | Propósito                            |
| ------------ | :----------------------: | ------------------------------------ |
| `usuario_id` |         **Sim**          | Quem é responsável pelo pedido agora |
| `criador_id` |           Não            | Quem fez a solicitação originalmente |

### Nota sobre `pedidos.cgeo_id`

Coluna `Integer` sem FK declarada. Intencional: evita ambiguidade de carregamento
assíncrono com múltiplas foreign keys para `usuarios`. A integridade referencial
é garantida pela camada de serviço.

---

## 8. Fluxo de Status do Pedido

```
                     SOLICITANTE envia
                           │
                    ┌──────▼──────┐
                    │  RASCUNHO   │◄──────────────────────────────────────┐
                    └──────┬──────┘                                        │
                           │ submit()                                      │
          orgao=COTER ─────┼───── orgao=DSG/DEC/COLOG/DECEx               │
               │           │               │                               │
               ▼           │               ▼                               │
  AGUARDANDO_SUPERVISOR    │   AGUARDANDO_CONSOLIDADOR                editar()
               │           │               │                               │
         aprovar()         │         aprovar()                             │
               │           │               │                               │
               └──────┬────┘               │                               │
                      │                    │                               │
                      └──────────┬─────────┘                               │
                                 │                                         │
                       AGUARDANDO_CARTOGRAFICO ──── reprovar() ──► REPROVADO
                                 │
                          assign_cgeo()
                                 │
                         ATRIBUIDO_CGEO ──────────── reprovar() ──► REPROVADO
                                 │
                            aprovar()  (CGEO)
                                 │
                             APROVADO ───────────── reprovar() ──► REPROVADO
                                 │
                             pronto()  (CGEO)
                                 │
                            PRODUZIDO

CANCELADO: cancel() pelo solicitante em RASCUNHO
```

---

## 9. Cadeia de Aprovação por Órgão Vinculante

| `orgao_vinculante` | Etapa 1     | Etapa 2            | Etapa 3            | Etapa 4 |
| ------------------ | ----------- | ------------------ | ------------------ | ------- |
| `COTER`            | Solicitante | Supervisor {CMilA} | Consolidador COTER | DSG     |
| `DSG`              | Solicitante | Consolidador DSG   | DSG                | —       |
| `DEC`              | Solicitante | Consolidador DEC   | DSG                | —       |
| `COLOG`            | Solicitante | Consolidador COLOG | DSG                | —       |
| `DECEx`            | Solicitante | Consolidador DECEx | DSG                | —       |

**Regra de pulo:** pedidos de solicitantes vinculados a DSG/DEC/COLOG/DECEx
saltam a etapa de supervisor e entram direto na fila do consolidador do órgão.

**CMilA → Supervisor** via `pedidos.regiao_militar` (`RM_TO_SUPERVISOR`):

| `regiao_militar` | Perfil notificado  |
| ---------------- | ------------------ |
| `CMP`            | `SUPERVISOR_CMP`   |
| `CML`            | `SUPERVISOR_CML`   |
| `CMS`            | `SUPERVISOR_CMS`   |
| `CMO`            | `SUPERVISOR_CMO`   |
| `CMAO`           | `SUPERVISOR_CMAO`  |
| `CMA`            | `SUPERVISOR_CMA`   |
| `CMNOR`          | `SUPERVISOR_CMNOR` |
| `CMSE`           | `SUPERVISOR_CMSE`  |

---

## 10. Hierarquia de Perfis e Roteamento

```
┌─────────────────────────────────────────────────────────────────┐
│                     DSG — Produção                               │
│   GESTOR_CARTOGRAFICO  ──atribui──►  ANALISTA_CGEO              │
└────────────────────────┬────────────────────────────────────────┘
                         ▲ AGUARDANDO_CARTOGRAFICO
┌────────────────────────┴────────────────────────────────────────┐
│                  Consolidadores por Órgão                        │
│   CONSOLIDADOR_COTER / _DSG / _DEC / _COLOG / _DECEX            │
└────────────────────────┬────────────────────────────────────────┘
                         ▲ AGUARDANDO_CONSOLIDADOR
                   (apenas COTER passa por aqui ↓)
┌────────────────────────┴────────────────────────────────────────┐
│           Supervisores Regionais (um por CMilA)                  │
│   SUPERVISOR_CMP / _CML / _CMS / _CMO / _CMAO / _CMA           │
│   SUPERVISOR_CMNOR / _CMSE                                       │
└────────────────────────┬────────────────────────────────────────┘
                         ▲ AGUARDANDO_SUPERVISOR
┌────────────────────────┴────────────────────────────────────────┐
│                      Solicitantes                                │
│                      SOLICITANTE                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Supervisores e Consolidadores** também criam pedidos próprios, que entram
diretamente no nível correspondente da hierarquia (self-submit automático).

---

_Documento gerado em 2026-05-22. Sincronizar a cada mudança estrutural nos modelos._
