# Code Atlas — Contexto para IA: SISPGEO

> Digest gerado pelo Code Atlas em 2026-06-11 22:02 UTC. Não edite à mão — é regenerado a cada `codeatlas scan`. Consulte os dados detalhados via servidor MCP (`codeatlas`), **não** lendo os JSONs crus de `.codeatlas/` (custosos em tokens).

## Arquitetura
- **Nós:** 1858 · **Arestas:** 2185
- **Tipos dominantes:** variable (608), import (375), concept (232), function (209), file (121), class (91)
- **Clusters (comunidades funcionais):**
    - models (283 nós) — predominância: file
    - routers (120 nós) — predominância: function
    - services (91 nós) — predominância: function
    - tests (78 nós) — predominância: function
    - Cluster 4 (69 nós) — predominância: concept
    - Cluster 5 (56 nós) — predominância: concept
    - Cluster 6 (53 nós) — predominância: concept
    - Cluster 7 (40 nós) — predominância: concept
- **Endpoints REST mapeados:** 73
    - `DELETE /janelas/{janela_id}`
    - `DELETE /pedidos/admin/{pedido_id}`
    - `DELETE /pedidos/{pedido_id}`
    - `DELETE /pedidos/{pedido_id}/items/{item_id}`
    - `GET /api/v1/health`
    - `GET /auth/confirm-email/{token}`
    - … (+67 mais — use `atlas_list_nodes`)

## Indicadores e hotspots
- **Redução de tokens (mapa vs. fonte):** 79.0%
- **AI Readiness:** 78/100  (tipagem 93%, docs 60%, tamanho 94%, acoplamento 99%, testes 41%)
- **Tech-Debt contextual:** 70/100

**Hotspots prioritários** (issue × centralidade — comece a refatoração por aqui):

| Severidade | Regra | Local | Problema |
|---|---|---|---|
| warning | C003 | `backend/app/routers/pedidos.py:52` | `_enrich` em router com 58 linhas |
| critical | C001 | `backend/app/routers/pedidos.py:847` | `_build_admin_zip` — 310 linhas |
| warning | C001 | `backend/app/services/pedido_service.py:126` | `submit_pedido` — 141 linhas |
| warning | C001 | `backend/app/services/pedido_service.py:470` | `cgeo_review` — 93 linhas |
| warning | SOL002 | `backend/app/services/pedido_service.py:470` | `cgeo_review` — 6 parâmetros |
| critical | SOL002 | `backend/app/services/auth_service.py:63` | `register_user` — 12 parâmetros |
| critical | SOL002 | `backend/app/utils/email_templates.py:549` | `notificar_gestor` — 9 parâmetros |
| warning | C001 | `backend/app/services/pedido_service.py:270` | `review_pedido` — 79 linhas |
| warning | C001 | `backend/scripts/create_hierarchy_users.py:522` | `run` — 142 linhas |
| warning | C003 | `backend/scripts/create_hierarchy_users.py:522` | `run` em router com 142 linhas |

## Workflow de refatoração (use as ferramentas MCP `codeatlas`)

Não leia `graph.json`/`*.cytoscape.json` — consulte sob demanda:

1. **Orientar-se:** `atlas_status` — visão geral do projeto.
2. **Triar:** `atlas_quality_issues(severity="critical")` — comece pelos hotspots acima.
3. **Localizar:** `atlas_search("<descrição do comportamento>")` ou `atlas_get_file("<arquivo>")` para achar o nó-alvo (ID `tipo:arquivo::nome`).
4. **Contexto mínimo:** `atlas_context_pack(node_id, task="modify", budget=1200)` — traz só callers/callees/impactos/riscos/testes que cabem no orçamento de tokens.
5. **Medir o risco ANTES de mexer:** `atlas_impact_analysis(node_id)` — raio de explosão (callers diretos/indiretos, arquivos dependentes, testes que cobrem).
6. **Aplicar a mudança** com esse contexto; rode os testes apontados.
7. **Validar ganho:** re-scan e compare `atlas_readiness` (AI Readiness deve subir, Tech-Debt cair).
8. **Registrar decisão:** `atlas_memory_store(type="decision", content=...)` — persiste o porquê para sessões futuras.

## Mantendo o atlas atualizado

Os dados acima refletem o último scan. Após mudanças relevantes, regenere:

```bash
codeatlas scan "C:\Desenvolvimento\SISPGEO\SISPGEO\SISPGEO"
```

Isso reconstrói o grafo e regenera `token_index.json`, `readiness.json` e este digest. Para visualização interativa: `codeatlas serve "C:\Desenvolvimento\SISPGEO\SISPGEO\SISPGEO" --port 3009`.
