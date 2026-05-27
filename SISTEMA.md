# SISGEO - Sistema Integrado de Solicitações de Geoinformação

## Documento de Funcionamento e Finalidade

**Órgão:** Diretoria de Serviço Geográfico do Exército Brasileiro (DSG/EB)  
**Versão:** 1.0  
**Classificação:** Uso interno - DSG/EB

---

## 1. Finalidade

O **SISGEO** é a plataforma oficial da DSG/EB para o gerenciamento centralizado das solicitações anuais de produtos geoinformacionais do Exército Brasileiro.

O sistema permite que Organizações Militares (OM) de todo o País solicitem eletronicamente produtos cartográficos e geoespaciais - cartas topográficas, ortoimagens, modelos digitais de terreno, entre outros - substituindo o processo manual baseado em ofícios e planilhas por um fluxo digital, rastreável e com janelas temporais controladas.

---

## 2. Contexto operacional

A DSG/EB é o órgão responsável pela produção e distribuição de produtos de geoinformação para as Forças Armadas. Anualmente, as OM de todo o Brasil encaminham suas necessidades cartográficas, que são consolidadas, analisadas e atendidas conforme a capacidade produtiva dos Centros de Geoinformação (CGEO) subordinados à DSG.

O processo envolve múltiplos escalões da cadeia de comando:

```
OM Solicitante
    └── Brigada / Divisão
            └── Comando Militar de Área (C Mil. A)
                    └── COTER (Comando de Operações Terrestres)
                            └── DSG (Diretoria de Serviço Geográfico)
                                    └── CGEO (Centro de Geoinformação)
```

---

## 3. Perfis de usuário

O sistema possui **7 perfis** com permissões distintas:

| Perfil                        | Sigla               | Papel no fluxo                                                            |
| ----------------------------- | ------------------- | ------------------------------------------------------------------------- |
| **Usuário OMDS**              | `USUARIO_OMDS`      | Cria e submete pedidos de produtos geoinformacionais                      |
| **Gestor de Brigada**         | `GESTOR_BRIGADA`    | Revisa e consolida pedidos das OM subordinadas e encaminha ao C Mil. A    |
| **Gestor de Divisão**         | `GESTOR_DIVISAO`    | Idêntico ao Gestor de Brigada - para estruturas de divisão                |
| **Gestor C Mil. A**           | `GESTOR_CMA`        | Consolida pedidos da área e encaminha ao COTER                            |
| **Gestor Demandante (COTER)** | `GESTOR_DEMANDANTE` | Recebe os pedidos, consolida e encaminha à DSG                            |
| **Gestor DSG**                | `GESTOR_DSG`        | Administra o sistema, controla janelas, atribui pedidos aos CGEOs         |
| **Gestor CGEO**               | `GESTOR_CGEO`       | Analisa viabilidade de produção e registra o atendimento ou inviabilidade |

---

## 4. Produtos disponíveis para solicitação

| Produto                                         | Escalas disponíveis                         |
| ----------------------------------------------- | ------------------------------------------- |
| Carta Topográfica                               | 1:25.000 · 1:50.000 · 1:100.000 · 1:250.000 |
| Carta Ortoimagem                                | 1:25.000 · 1:50.000                         |
| Ortoimagem                                      | 1:25.000 · 1:50.000                         |
| Modelo Digital de Terreno (MDT)                 | 1:25.000 · 1:50.000                         |
| Modelo Digital de Superfície (MDS)              | 1:25.000 · 1:50.000                         |
| CDGV (Conjunto de Dados Geoespaciais Vetoriais) | 1:25.000 · 1:50.000                         |
| Impressão de Produto Geoespacial                | -                                           |

Cada item de pedido é identificado pela **nomenclatura INOM** (Índice de Nomenclatura) e pelo **número MI** (Mapa Índice), que correspondem às folhas da cartografia sistemática brasileira.

---

## 5. Fluxo de solicitação

### 5.1 Calendário anual

O ciclo de solicitações segue janelas temporais configuradas pelo Gestor DSG:

| Período               | Quem age            | O que acontece                              |
| --------------------- | ------------------- | ------------------------------------------- |
| **Fevereiro – Março** | OM (USUARIO_OMDS)   | Criação e submissão de pedidos              |
| **Março – Abril**     | Brigadas e C Mil. A | Revisão e consolidação                      |
| **Junho – Julho**     | COTER               | Recebimento e encaminhamento à DSG          |
| **Agosto**            | DSG                 | Recebimento, análise e atribuição aos CGEOs |
| **Agosto**            | CGEOs               | Análise de viabilidade e resposta final     |

### 5.2 Passo a passo do fluxo

```
1. USUARIO_OMDS
   └─ Acessa "Solicitar Produtos"
   └─ Seleciona produto, escala e data desejada de entrega
   └─ Clica nas células INOM no mapa interativo (grade 1:50.000)
   └─ Submete o pedido
           ↓
2. GESTOR_BRIGADA
   └─ Visualiza pedidos pendentes de sua Brigada
   └─ Pode revisar, aprovar, reprovar ou solicitar ajustes
   └─ Consolida os pedidos aprovados e encaminha ao C Mil. A
           ↓
3. GESTOR_CMA
   └─ Visualiza pedidos recebidos da(s) Brigada(s)
   └─ Consolida e encaminha ao COTER
           ↓
4. GESTOR_DEMANDANTE (COTER)
   └─ Consolida pedidos do(s) C Mil. A subordinados
   └─ Encaminha o conjunto à DSG
           ↓
5. GESTOR_DSG
   └─ Visualiza todos os pedidos recebidos
   └─ Atribui cada pedido ao CGEO responsável
           ↓
6. GESTOR_CGEO
   └─ Analisa a viabilidade de produção
   └─ Registra "Iniciar atendimento" (pedido será atendido)
      ou "Registrar inviabilidade" (pedido não pode ser atendido)
           ↓
7. OM Solicitante
   └─ Recebe notificação por e-mail com o resultado
   └─ Visualiza o status final em "Meus Pedidos"
```

### 5.3 Status do pedido

| Status                 | Significado                                       |
| ---------------------- | ------------------------------------------------- |
| `Rascunho`             | Pedido criado, não enviado                        |
| `Aguardando Brigada`   | Enviado ao gestor de brigada                      |
| `Aguardando C Mil. A`  | Consolidado pela brigada, aguarda C Mil. A        |
| `Aguardando COTER`     | Consolidado pelo C Mil. A, aguarda COTER          |
| `Aguardando DSG`       | Enviado à DSG                                     |
| `Em Análise CGEO`      | Atribuído ao CGEO, em análise de viabilidade      |
| `Em Atendimento`       | CGEO confirmou o atendimento                      |
| `Inviável`             | CGEO registrou inviabilidade de produção          |
| `Alterado pelo Gestor` | Gestor solicitou ajustes - aguarda nova submissão |
| `Cancelado`            | Pedido cancelado pelo solicitante                 |

---

## 6. Funcionalidades principais

### Mapa interativo

- Grade INOM oficial 1:50.000 carregada a partir do shapefile `asc_mi_50k.shp` da DSG
- Coloração por idade dos dados disponíveis no BDGEx (verde = recente, vermelho = desatualizado)
- Clique nas células para adicionar ao carrinho de pedidos
- Visualização de pedidos existentes sobrepostos ao mapa

### Janelas temporais

- O Gestor DSG configura 5 janelas por ano (OMs, Brigadas/C Mil. A, COTER, DSG, CGEO)
- Cada perfil visualiza apenas o prazo relevante ao seu papel
- Banner de prazo visível em todas as telas: verde (aberto), vermelho (urgente), cinza (encerrado)
- Usuários podem solicitar prorrogação de prazo ao escalão superior com justificativa

### Notificações

- E-mail automático ao solicitante: confirmação de submissão, aprovação e resultado final
- E-mail ao gestor: novos pedidos aguardando revisão
- Notificação interna no sistema (sininho) para cada movimentação relevante

### Administração (Gestor DSG)

- Gerenciar todos os usuários: perfil, demandante, ativação/desativação
- Visualizar e excluir qualquer pedido do sistema
- Controlar janelas temporais de cada grupo
- Atribuir pedidos recebidos aos CGEOs

### Meus Pedidos (solicitante)

- Expandir cada pedido para ver todos os detalhes e itens
- Editar pedidos em rascunho
- Cancelar pedidos antes de serem encaminhados além da Brigada
- Solicitar remoção formal (notificação ao gestor) quando o pedido já foi enviado
- Espacializar pedido: visualizar as células INOM no mapa

---

## 7. Arquitetura técnica

| Camada             | Tecnologia                                                  |
| ------------------ | ----------------------------------------------------------- |
| **Frontend**       | React 18 · TypeScript · Vite · Tailwind CSS · React-Leaflet |
| **Backend**        | FastAPI (Python 3.12) · SQLAlchemy (async) · Pydantic v2    |
| **Banco de dados** | PostgreSQL 16 com extensão PostGIS                          |
| **Autenticação**   | JWT (Bearer Token) · bcrypt para senhas                     |
| **E-mail**         | SMTP via MailHog (dev) ou servidor SMTP configurável (prod) |
| **Mapa**           | Leaflet.js · OpenStreetMap · Shapefile DSG (pyshp)          |
| **Infraestrutura** | Docker Compose · Nginx (proxy reverso)                      |

### Diagrama de rede Docker

```
Usuário (navegador)
        │ porta 80
        ▼
   [sispgeo_nginx]  ← proxy reverso
    /api/v1/* → [sispgeo_backend] → [sispgeo_db]
    /*         → [sispgeo_frontend]
        │ porta 8025
        ▼
  [sispgeo_mailpit] ← e-mails de desenvolvimento
```

---

## 8. Integração com o BDGEx

O sistema consulta o **BDGEx (Banco de Dados Geoespaciais do Exército)** para verificar quais produtos já estão disponíveis digitalmente, exibindo essa informação durante a seleção de itens. Em ambiente de desenvolvimento (`BDGEX_MOCK=true`), dados simulados são utilizados. Para operação real na intranet do Exército, configure `BDGEX_MOCK=false`.

---

## 9. Segurança e controle de acesso

- Todos os endpoints da API exigem autenticação JWT válida
- Cada endpoint verifica o perfil do usuário antes de processar a requisição
- Usuários só visualizam pedidos de seu próprio demandante (exceto o Gestor DSG que vê todos)
- Senhas armazenadas com hash bcrypt (custo 12)
- Cadastro restrito a e-mails `@eb.mil.br`
- Confirmação de e-mail obrigatória antes do primeiro acesso

---

## 10. Glossário

| Termo          | Significado                                                                       |
| -------------- | --------------------------------------------------------------------------------- |
| **INOM**       | Índice de Nomenclatura - identificador único de uma folha cartográfica brasileira |
| **MI**         | Mapa Índice - número de referência da carta na escala 1:100.000                   |
| **BDGEx**      | Banco de Dados Geoespaciais do Exército                                           |
| **DSG**        | Diretoria de Serviço Geográfico do Exército Brasileiro                            |
| **CGEO**       | Centro de Geoinformação (unidade produtora subordinada à DSG)                     |
| **COTER**      | Comando de Operações Terrestres                                                   |
| **C Mil. A**   | Comando Militar de Área                                                           |
| **OM**         | Organização Militar                                                               |
| **OMDS**       | Organização Militar Diretamente Subordinada                                       |
| **Demandante** | Órgão responsável pelo conjunto de OM de uma região (ex: 1ª Brigada)              |

---

_Para instruções de instalação e operação, consulte [`README.md`](README.md)._
