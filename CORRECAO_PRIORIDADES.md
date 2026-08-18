# SisPGeo — Correção das Prioridades de Encaminhamento

> Passo a passo para corrigir as prioridades que ficaram erradas por causa do
> defeito no arrasto (reordenação), e para conferir cada pedido antes de aplicar.
> Executar como usuário com perfil **Gestor Cartográfico (DSG)**.

---

## Sumário

1. [O que aconteceu, em uma frase](#1-o-que-aconteceu-em-uma-frase)
2. [Lista de pedidos: o que está certo e o que precisa de correção](#2-lista-de-pedidos-o-que-está-certo-e-o-que-precisa-de-correção)
3. [Como o sistema decide a nova prioridade](#3-como-o-sistema-decide-a-nova-prioridade)
4. [Passo a passo da correção](#4-passo-a-passo-da-correção)
5. [Conferindo a planilha antes de enviar](#5-conferindo-a-planilha-antes-de-enviar)
6. [O que o sistema recusa (e por quê)](#6-o-que-o-sistema-recusa-e-por-quê)
7. [Conferindo depois de aplicar](#7-conferindo-depois-de-aplicar)
8. [Perguntas frequentes](#8-perguntas-frequentes)

---

## 1. O que aconteceu, em uma frase

Ao arrastar os pedidos para reordenar, o sistema gravava a prioridade `1..N`
sobre a fila **pendente na tela naquele momento**. Assim que uma leva era
enviada, ela saía da fila, e a leva seguinte recomeçava a numerar do 1 —
reaproveitando números que já tinham sido usados. Dois pedidos diferentes
podiam terminar com a mesma prioridade.

Isso já foi corrigido no sistema (o número nunca mais se repete). O que este
documento resolve é o **passivo**: os pedidos que já foram encaminhados antes
da correção e ficaram com prioridades coincidentes.

---

## 2. Lista de pedidos: o que está certo e o que precisa de correção

Levantamento feito em cima dos dados reais do sistema. Cada bloco é um
**escalão** — um supervisor específico ou um consolidador específico —, porque
cada um tem a sua própria numeração; o mesmo número `1` pode existir
legitimamente em dois escalões diferentes.

### ✅ Escalões íntegros — não precisam de nada

Estes já estão com prioridade `1..N` sem repetição, na ordem em que a
prioridade foi definida. **Não mexer.**

**Consolidador COTER**

| Pedido | Prioridade | Solicitante | OM |
|---|---|---|---|
| 1050 | 1 | Marcio Azeredo | DSG |
| 1049 | 2 | Marcio Azeredo | DSG |
| 1051 | 3 | Marcio Azeredo | DSG |
| 1052 | 4 | Marcio Azeredo | DSG |
| 1042 | 5 | Jean Michael | EsSLog |
| 1053 | 6 | Marcio Azeredo | DSG |
| 1054 | 7 | Marcio Azeredo | DSG |

**Supervisor CMP**

| Pedido | Prioridade | Solicitante | OM |
|---|---|---|---|
| 1030 | 1 | Raphael Heleno Pinho | 2º CGEO |
| 1040 | 2 | Raphael Heleno Pinho | 2º CGEO |
| 1025 | 3 | Raphael Heleno Pinho | 2º CGEO |
| 1024 | 4 | Raphael Heleno Pinho | 2º CGEO |
| 1036 | 5 | Marcio Azeredo | DSG |
| 1022 | 6 | Raphael Heleno Pinho | 2º CGEO |
| 1008 | 7 | Raphael Eduardo Godi | 2º CGEO |

**Solicitante (usuário id 4)**

| Pedido | Prioridade |
|---|---|
| 1047 | 1 |
| 1046 | 2 |
| 1044 | 3 |

### ⚠️ Escalões que precisam de correção

**Consolidador DSG** — este é o caso relatado originalmente: 1006/1020
dividindo a prioridade 8, e 1023/1032 dividindo a 9.

| Pedido | Prioridade atual | Prioridade corrigida | Solicitante | OM | Leva de envio |
|---|---|---|---|---|---|
| 1031 | 1 | **1** | Raphael Heleno Pinho | 2º CGEO | 18/08 12:11:07 |
| 1041 | 2 | **2** | Marcio Azeredo | DSG | 18/08 12:11:07 |
| 1034 | 3 | **3** | Marcio Azeredo | DSG | 18/08 12:11:07 |
| 1006 | 8 ⚠️ | **4** | Marcio Azeredo | DSG | 18/08 12:11:38 |
| 1023 | 9 ⚠️ | **5** | Raphael Heleno Pinho | 2º CGEO | 18/08 12:11:53 |
| 1020 | 8 ⚠️ | **6** | wilson teles alves m. | 2º CGEO | 18/08 12:12:30 |
| 1032 | 9 ⚠️ | **7** | Vinícius Magalhães | 4º CGEO | 18/08 12:12:30 |
| 1019 | 10 | **8** | wilson teles alves m. | 2º CGEO | 18/08 12:12:30 |

**Solicitante (usuário id 14)** — pedido nunca priorizado (prioridade `0`),
não há conflito, só não tem número ainda.

| Pedido | Prioridade atual | Prioridade corrigida |
|---|---|---|
| 1048 | — (0) | **1** |

> A coluna "Prioridade corrigida" já é exatamente o que a planilha do
> [passo 4](#4-passo-a-passo-da-correção) vai trazer pré-preenchido — não
> precisa copiar estes números à mão, é só conferir se cada linha bate com o
> que você pretendia.

---

## 3. Como o sistema decide a nova prioridade

A regra muda conforme o estado de cada escalão, e é importante entender o
porquê para revisar a planilha com segurança:

- **Prioridades já corretas (sem repetição)** → o sistema mantém a ordem que
  elas já indicam. É a decisão original de quem priorizou, e ela é respeitada.
- **Prioridades repetidas** → o sistema usa a ordem em que os pedidos foram
  **enviados** (a "leva"), porque é o único sinal confiável que sobrou quando
  o número se perdeu.

Isso importa porque a ordem de envio **não é sempre** a ordem de prioridade —
um usuário pode enviar os pedidos em qualquer sequência e definir a prioridade
de forma independente antes de enviar. É por isso que a correção só reordena
por data de envio nos escalões onde a numeração já estava quebrada; nos demais,
ela não toca em nada.

---

## 4. Passo a passo da correção

### 4.1. Fazer login e obter o token

```bash
curl -s -X POST https://SEU_DOMINIO/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"SEU_EMAIL@eb.mil.br","senha":"SUA_SENHA"}'
```

A resposta traz `"access_token": "..."`. Guarde esse valor:

```bash
export TOKEN="cole_aqui_o_token"
```

> Precisa ser um usuário com perfil **Gestor Cartográfico (DSG)** — os dois
> endpoints abaixo são exclusivos desse perfil.

### 4.2. Baixar a planilha atual

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  https://SEU_DOMINIO/api/v1/prioridades/planilha \
  -o prioridades.csv
```

Isso **não altera nada** no sistema — é só leitura. Abra `prioridades.csv` no
Excel (a acentuação vem correta). Colunas:

| Coluna | O que é |
|---|---|
| `Pedido_ID` | número do pedido |
| `Nova_Prioridade` | **a única coluna que o sistema lê ao reimportar** |
| `Prioridade_Atual` | o que está gravado hoje (para comparação) |
| `Escalao_Remetente` | nível: Solicitante / Supervisor / Consolidador |
| `Sequencia` | identifica exatamente qual supervisor/consolidador (ex.: `SUPERVISOR_CMP`, `CONSOLIDADOR_DSG`) |
| `Status`, `Orgao_Vinculante`, `C_Mil_A`, `OM`, `Solicitante`, `Leva_Enviada_Em` | contexto para conferência |

A coluna `Nova_Prioridade` já sai preenchida seguindo a regra do
[item 3](#3-como-o-sistema-decide-a-nova-prioridade) — na prática, os mesmos
valores da tabela do [item 2](#2-lista-de-pedidos-o-que-está-certo-e-o-que-precisa-de-correção).

### 4.3. Editar a planilha (se necessário)

Se a ordem sugerida bater com o que você pretendia, não precisa mudar nada —
pode reimportar como está. Se quiser ajustar algum pedido específico dentro de
um escalão, edite apenas o número em `Nova_Prioridade` daquela linha.

Regras a respeitar ao editar (o sistema valida e recusa se alguma for
violada — ver [item 6](#6-o-que-o-sistema-recusa-e-por-quê)):

- Números **inteiros, a partir de 1** (não use 0 nem negativos).
- **Sem repetir** um número dentro do mesmo `Sequencia` (mesmo supervisor ou
  mesmo consolidador). Repetir entre `Sequencia` diferentes não tem problema —
  é esperado que `SUPERVISOR_CMP` e `SUPERVISOR_CML` tenham ambos uma
  prioridade 1, por exemplo.
- Não precisa ser sequencial sem buracos, mas o recomendado é manter `1..N`
  para ficar fácil de ler depois.

### 4.4. Reimportar a planilha

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -F "arquivo=@prioridades.csv" \
  https://SEU_DOMINIO/api/v1/prioridades/planilha
```

Resposta em caso de sucesso:

```json
{"atualizados": 26, "escaloes": ["CONSOLIDADOR_COTER", "CONSOLIDADOR_DSG", "SOLICITANTE:14", "SOLICITANTE:4", "SUPERVISOR_CMP"]}
```

`atualizados` é quantos pedidos foram gravados. Não precisa se preocupar com
os escalões íntegros: mesmo que venham na planilha e sejam "reimportados",
eles recebem exatamente os mesmos números que já tinham — nada muda na prática.

---

## 5. Conferindo a planilha antes de enviar

Antes do passo 4.4, é uma boa prática abrir o CSV e:

1. Ordenar por `Sequencia`, depois por `Nova_Prioridade`.
2. Para cada grupo (`Sequencia`), confirmar que os números vão de `1` a `N`
   sem repetir.
3. Olhar a coluna `Leva_Enviada_Em` dos grupos marcados como corrigidos —
   confirma se a ordem faz sentido com o que você lembra de ter enviado.

---

## 6. O que o sistema recusa (e por quê)

A importação é **tudo ou nada**: se qualquer linha tiver um problema, **nada**
é gravado — nem as linhas corretas. O sistema devolve a lista de erros
encontrados (até 20), cada um citando a linha do arquivo. Casos recusados:

| Situação | Exemplo de mensagem |
|---|---|
| Prioridade repetida no mesmo escalão | `Prioridade 1 repetida em CONSOLIDADOR_DSG: pedidos 1031 e 1041` |
| Pedido que não existe no sistema | `Pedidos inexistentes: 999999` |
| Prioridade não numérica | `Linha 10: Nova_Prioridade inválida ('abc') no pedido 1041` |
| Prioridade menor que 1 | `Linha 10: Nova_Prioridade deve ser 1 ou maior (pedido 1041)` |
| Pedido repetido na planilha | `Linha 12: pedido 1041 aparece mais de uma vez na planilha` |
| Pedido que já saiu do fluxo (cancelado/reprovado) | listado como fora do fluxo |
| Coluna `Pedido_ID` ou `Nova_Prioridade` ausente | planilha recusada por completo |

Se a importação for recusada, corrija o CSV e repita o passo 4.4 — nenhum
dado foi alterado até aqui.

---

## 7. Conferindo depois de aplicar

### 7.1. Na interface

Entre como Gestor DSG (ou como o supervisor/consolidador do escalão
corrigido) e confira:

- A ordem dos pedidos na lista.
- O selo **"Recebido em / Prioridade N"** em cada pedido.
- No detalhe expandido, a cadeia completa —
  `Solicitante <OM>: Prioridade N → Supervisor <Órgão>: Prioridade N → …`

### 7.2. Reexportando a planilha

Baixe a planilha de novo (passo 4.2). As colunas `Prioridade_Atual` e
`Nova_Prioridade` devem estar iguais em todas as linhas — sinal de que já não
há mais nada para corrigir naquele escalão.

---

## 8. Perguntas frequentes

**Preciso repetir isso toda vez que um usuário reordenar errado?**
Não. Isto é uma correção pontual do passivo anterior à atualização do
sistema. Depois da correção, o próprio sistema impede que dois pedidos do
mesmo escalão dividam uma prioridade — a numeração passou a ser definitiva no
momento do envio, e nunca mais é sobrescrita por um arrasto seguinte.

**E se eu importar sem editar nada?**
Sem problema. Os escalões íntegros recebem os mesmos números que já tinham; só
os escalões corrompidos mudam, para a ordem reconstruída pela leva de envio.

**Como sei quais pedidos vieram de qual supervisor ou consolidador?**
Pela coluna `Sequencia` da planilha. Ela é o identificador exato — por
exemplo `SUPERVISOR_CMP` (Comando Militar do Planalto) ou `CONSOLIDADOR_DECEX`
— e é a mesma chave usada internamente para a numeração de cada escalão.

**Isso mexe em pedidos que ainda estão em rascunho?**
Não. Só pedidos já submetidos (aguardando algum escalão, atribuído a CGEO,
aprovado ou produzido) aparecem na planilha.
