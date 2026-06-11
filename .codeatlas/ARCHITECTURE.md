# SISPGEO — Documentação do Sistema

> Gerado automaticamente pelo **Code Atlas** em 2026-06-02 09:09  
> 1858 nós · 2185 arestas · [Abrir no Visualizador](http://localhost:3002) · [Docs API](http://localhost:3002/api/docs)

## Visão Geral

**Resumo:** **121** arquivos · **91** classes · **73** endpoints REST · **81** métodos · **608** campos


## Arquitetura em Camadas

    down CALLS
**NotificationService**  (@Service)

```
[Routers]
**ConfigEntregaOut**, **ConfigEntregaUpdate**, **JanelaCreate**, **JanelaUpdate**, **JanelaOut**, **MinhaJanelaOut** (+12 mais)

    down CALLS
[Services]
**NotificationService**

    down USES
[Models/ORM]
**ApiMetrica**, **AuditLog**, **BdgexCache**, **ConfigEntrega**, **PerfilEnum**, **OrgaoVinculanteEnum** (+15 mais)


[Schemas/DTOs]: **RegisterRequest**, **LoginRequest**, **TokenResponse**, **ResendActivationRequest**, **ForgotPasswordRequest**, **ResetPasswordRequest** (+25 mais)

```


## Endpoints REST

| Método | Path | Implementação | Chama |

|--------|------|---------------|-------|

| **GET** | `/api/v1/health` | `health()` | — |

| **GET** | `/auth/confirm-email/{token}` | `confirm_email()` | `info`, `confirm_email` |

| **POST** | `/auth/forgot-password` | `forgot_password()` | `get_client_ip`, `info`, `request_password_reset` |

| **POST** | `/auth/login` | `login()` | `get_client_ip`, `info`, `authenticate_user` |

| **POST** | `/auth/register` | `register()` | `get_client_ip`, `info`, `register_user` |

| **POST** | `/auth/resend-activation` | `resend_activation()` | `info`, `resend_activation_email` |

| **POST** | `/auth/reset-password` | `reset_password()` | `info`, `reset_password` |

| **GET** | `/config/entrega` | `get_config_entrega()` | `get_or_create_config`, `datas_minimas_para` |

| **PUT** | `/config/entrega` | `update_config_entrega()` | `info`, `require_profiles`, `get_or_create_config` |

| **GET** | `/historico` | `get_historico_global()` | `require_profiles`, `_enrich` |

| **GET** | `/janelas` | `list_janelas()` | — |

| **POST** | `/janelas` | `create_janela()` | `info`, `require_profiles` |

| **GET** | `/janelas/active` | `active_janelas()` | — |

| **GET** | `/janelas/minha-janela` | `minha_janela()` | `_get_tipo_janela` |

| **POST** | `/janelas/solicitar-prorrogacao` | `solicitar_prorrogacao()` | `info`, `notify_by_perfil` |

| **DELETE** | `/janelas/{janela_id}` | `delete_janela()` | `info`, `require_profiles` |

| **PUT** | `/janelas/{janela_id}` | `update_janela()` | `info`, `require_profiles` |

| **POST** | `/map/features-preview` | `features_preview()` | — |

| **GET** | `/map/inom-grid` | `inom_grid()` | `get_grid_gz` |

| **GET** | `/metricas/api` | `metricas_api()` | `require_profiles`, `_utcnow` |

| **GET** | `/metricas/pedidos` | `metricas_pedidos()` | `require_profiles`, `_utcnow` |

| **GET** | `/metricas/resumo` | `resumo_metricas()` | `_utcnow`, `require_profiles` |

| **GET** | `/om` | `list_oms()` | `_load_oms` |

| **POST** | `/oms` | `criar_om_customizada()` | — |

| **GET** | `/oms/{cmila}` | `listar_oms_customizadas()` | — |

| **GET** | `/operacoes` | `list_operacoes()` | — |

| **POST** | `/operacoes` | `create_operacao()` | — |

| **GET** | `/pedidos` | `list_pedidos()` | `_enrich`, `_rm_do_supervisor` |

| **POST** | `/pedidos` | `create_pedido()` | `get_or_create_config` |

| **GET** | `/pedidos/admin/all` | `admin_list_all()` | `require_profiles`, `_enrich` |

| **POST** | `/pedidos/admin/export` | `admin_export_geojson()` | `require_profiles`, `_enrich`, `_build_admin_zip` |

| **GET** | `/pedidos/admin/produtos-recentes` | `admin_produtos_recentes_bdgex()` | `require_profiles`, `_enrich` |

| **DELETE** | `/pedidos/admin/{pedido_id}` | `admin_delete_pedido()` | `require_profiles` |

| **PUT** | `/pedidos/admin/{pedido_id}` | `admin_update_pedido()` | `require_profiles`, `_enrich`, `registrar_historico` |

| **GET** | `/pedidos/cgeo-atendimento` | `cgeo_list_atendimento()` | `require_profiles`, `_enrich` |

| **POST** | `/pedidos/consolidate` | `consolidate()` | `require_profiles`, `_check_janela_open`, `consolidate_pedidos` |

| **GET** | `/pedidos/duplicatas` | `listar_duplicatas()` | `_enrich`, `_rm_do_supervisor` |

| **POST** | `/pedidos/enviar-lote` | `enviar_lote()` | `_enrich`, `submit_pedido` |

| **GET** | `/pedidos/export` | `exportar_pedidos()` | `require_profiles`, `_enrich`, `_build_admin_zip` |

| **GET** | `/pedidos/homologados` | `list_homologados()` | `require_profiles`, `_enrich`, `_rm_do_supervisor` |

| **GET** | `/pedidos/map-features` | `get_map_features()` | `_enrich`, `_rm_do_supervisor` |

| **GET** | `/pedidos/pending` | `list_pending()` | `_enrich`, `_rm_do_supervisor` |

| **GET** | `/pedidos/relatorio` | `exportar_relatorio()` | `_slug`, `require_profiles`, `_enrich` |

| **PUT** | `/pedidos/reorder` | `reorder_pedidos()` | — |

| **DELETE** | `/pedidos/{pedido_id}` | `cancel_pedido()` | — |

| **GET** | `/pedidos/{pedido_id}` | `get_pedido()` | `_enrich` |

| **PUT** | `/pedidos/{pedido_id}` | `update_pedido()` | `_enrich` |

| **PUT** | `/pedidos/{pedido_id}/assign-cgeo` | `assign_cgeo()` | `require_profiles`, `assign_cgeo` |

| **PUT** | `/pedidos/{pedido_id}/cgeo-review` | `cgeo_review()` | `require_profiles`, `cgeo_review` |

| **POST** | `/pedidos/{pedido_id}/dar-pronto` | `dar_pronto()` | `require_profiles`, `registrar_historico`, `notify_user` |

| **GET** | `/pedidos/{pedido_id}/features` | `get_pedido_features()` | — |

| **GET** | `/pedidos/{pedido_id}/historico` | `get_historico_pedido()` | `_enrich` |

| **PUT** | `/pedidos/{pedido_id}/items/reorder` | `reorder_items()` | — |

| **DELETE** | `/pedidos/{pedido_id}/items/{item_id}` | `delete_item()` | `_rm_do_supervisor`, `_check_janela_open` |

| **PUT** | `/pedidos/{pedido_id}/review` | `review()` | `require_profiles`, `review_pedido`, `_check_janela_open` |

| **POST** | `/pedidos/{pedido_id}/solicitar-remocao` | `solicitar_remocao()` | — |

| **POST** | `/pedidos/{pedido_id}/submit` | `submit()` | `submit_pedido` |

| **GET** | `/transferencias` | `get_all_transferencias()` | `require_profiles`, `_enrich_transferencias` |

| **GET** | `/transferencias/minhas` | `get_minhas_transferencias()` | `_enrich_transferencias` |

| **GET** | `/transferencias/usuario/{user_id}` | `get_usuario_transferencias()` | `require_profiles`, `_enrich_transferencias` |

| **GET** | `/users` | `list_users()` | `require_profiles` |

| **GET** | `/users/me` | `get_me()` | — |

| **PUT** | `/users/me` | `update_me()` | — |

| **POST** | `/users/me/confirm-data` | `confirm_data()` | — |

| **GET** | `/users/me/notifications` | `get_notifications()` | — |

| **GET** | `/users/me/notifications/unread-count` | `get_unread_count()` | — |

| **PUT** | `/users/me/notifications/{notif_id}/read` | `mark_read()` | — |

| **PUT** | `/users/me/password` | `change_password()` | `get_password_hash`, `verify_password` |

| **GET** | `/users/mesma-om` | `list_mesma_om()` | — |

| **PUT** | `/users/{user_id}/activate` | `toggle_activate()` | `require_profiles`, `send_email` |

| **PUT** | `/users/{user_id}/dados-organizacionais` | `admin_update_dados_org()` | `require_profiles`, `send_email` |

| **PUT** | `/users/{user_id}/profile` | `update_profile()` | `require_profiles` |

| **POST** | `/users/{user_id}/transferir-pedidos` | `transferir_pedidos()` | `transferir_pedidos` |



### Detalhes de Cada Endpoint

#### `GET /api/v1/health`

- **Implementação:** `async def health()`

- **Arquivo:** `backend/app/main.py:418`



#### `GET /auth/confirm-email/{token}`

- **Implementação:** `async def confirm_email(token: str, db: AsyncSession=Depends(get_db))`

- **Arquivo:** `backend/app/routers/auth.py:63`

- **Cadeia de chamadas:**

  - `confirm_email()` → `def info(msg: str) -> None` (create_hierarchy_users.py:412)

  - `confirm_email()` → `async def confirm_email(db: AsyncSession, token: str) -> Usuario` (auth_service.py:150)



#### `POST /auth/forgot-password`

- **Implementação:** `async def forgot_password(body: ForgotPasswordRequest, request: Request, db: AsyncSession=Depends(get_db))`

- **Arquivo:** `backend/app/routers/auth.py:122`

- **Cadeia de chamadas:**

  - `forgot_password()` → `def get_client_ip(request: Request) -> str` (dependencies.py:86)

  - `forgot_password()` → `def info(msg: str) -> None` (create_hierarchy_users.py:412)

  - `forgot_password()` → `async def request_password_reset(db: AsyncSession, email: str, ip: str) -> None` (auth_service.py:275)



#### `POST /auth/login`

- **Implementação:** `async def login(body: LoginRequest, request: Request, db: AsyncSession=Depends(get_db))`

- **Arquivo:** `backend/app/routers/auth.py:75`

- **Cadeia de chamadas:**

  - `login()` → `def get_client_ip(request: Request) -> str` (dependencies.py:86)

  - `login()` → `def info(msg: str) -> None` (create_hierarchy_users.py:412)

  - `login()` → `async def authenticate_user(db: AsyncSession, email: str, senha: str, ip: str) -> str` (auth_service.py:191)



#### `POST /auth/register`

- **Implementação:** `async def register(body: RegisterRequest, request: Request, db: AsyncSession=Depends(get_db))`

- **Arquivo:** `backend/app/routers/auth.py:29`

- **Cadeia de chamadas:**

  - `register()` → `def get_client_ip(request: Request) -> str` (dependencies.py:86)

  - `register()` → `def info(msg: str) -> None` (create_hierarchy_users.py:412)

  - `register()` → `def register_user(client: httpx.Client, u: dict) -> tuple[bool, str]` (create_hierarchy_users.py:452)



#### `POST /auth/resend-activation`

- **Implementação:** `async def resend_activation(body: ResendActivationRequest, db: AsyncSession=Depends(get_db))`

- **Arquivo:** `backend/app/routers/auth.py:104`

- **Cadeia de chamadas:**

  - `resend_activation()` → `def info(msg: str) -> None` (create_hierarchy_users.py:412)

  - `resend_activation()` → `async def resend_activation_email(db: AsyncSession, email: str) -> None` (auth_service.py:365)



#### `POST /auth/reset-password`

- **Implementação:** `async def reset_password(body: ResetPasswordRequest, db: AsyncSession=Depends(get_db))`

- **Arquivo:** `backend/app/routers/auth.py:141`

- **Cadeia de chamadas:**

  - `reset_password()` → `def info(msg: str) -> None` (create_hierarchy_users.py:412)

  - `reset_password()` → `async def reset_password(db: AsyncSession, token: str, nova_senha: str) -> None` (auth_service.py:330)



#### `GET /config/entrega`

- **Implementação:** `async def get_config_entrega(db: AsyncSession=Depends(get_db), _: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/config.py:73`

- **Cadeia de chamadas:**

  - `get_config_entrega()` → `async def get_or_create_config(db: AsyncSession) -> ConfigEntrega` (config.py:44)

  - `get_config_entrega()` → `def datas_minimas_para(data_base: date) -> dict[str, str]` (config.py:36)



#### `PUT /config/entrega`

- **Implementação:** `async def update_config_entrega(body: ConfigEntregaUpdate, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/config.py:88`

- **Cadeia de chamadas:**

  - `update_config_entrega()` → `def info(msg: str) -> None` (create_hierarchy_users.py:412)

  - `update_config_entrega()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `update_config_entrega()` → `async def get_or_create_config(db: AsyncSession) -> ConfigEntrega` (config.py:44)

  - `update_config_entrega()` → `def datas_minimas_para(data_base: date) -> dict[str, str]` (config.py:36)



#### `GET /historico`

- **Implementação:** `async def get_historico_global(limit: int=200, offset: int=0, db: AsyncSession=Depends(get_db), _: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/historico.py:82`

- **Cadeia de chamadas:**

  - `get_historico_global()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `get_historico_global()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)



#### `GET /janelas`

- **Implementação:** `async def list_janelas(db: AsyncSession=Depends(get_db), _: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/janelas.py:129`



#### `POST /janelas`

- **Implementação:** `async def create_janela(body: JanelaCreate, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/janelas.py:155`

- **Cadeia de chamadas:**

  - `create_janela()` → `def info(msg: str) -> None` (create_hierarchy_users.py:412)

  - `create_janela()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)



#### `GET /janelas/active`

- **Implementação:** `async def active_janelas(db: AsyncSession=Depends(get_db), _: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/janelas.py:139`



#### `GET /janelas/minha-janela`

- **Implementação:** `async def minha_janela(db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/janelas.py:78`

- **Cadeia de chamadas:**

  - `minha_janela()` → `def _get_tipo_janela(perfil: PerfilEnum) -> TipoJanelaEnum | None` (janelas.py:25)



#### `POST /janelas/solicitar-prorrogacao`

- **Implementação:** `async def solicitar_prorrogacao(body: ProrrogacaoRequest, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/janelas.py:231`

- **Cadeia de chamadas:**

  - `solicitar_prorrogacao()` → `def info(msg: str) -> None` (create_hierarchy_users.py:412)

  - `solicitar_prorrogacao()` → `async def notify_by_perfil(self, perfil: PerfilEnum | frozenset[PerfilEnum], titulo: str, mensagem: str, pedido_id: int | None=None, orgao_vinculante: OrgaoVinculanteEnum | None=None, regiao_militar: str | None=None) -> int` (notification_service.py:65)



#### `DELETE /janelas/{janela_id}`

- **Implementação:** `async def delete_janela(janela_id: int, db: AsyncSession=Depends(get_db), _: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/janelas.py:273`

- **Cadeia de chamadas:**

  - `delete_janela()` → `def info(msg: str) -> None` (create_hierarchy_users.py:412)

  - `delete_janela()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)



#### `PUT /janelas/{janela_id}`

- **Implementação:** `async def update_janela(janela_id: int, body: JanelaUpdate, db: AsyncSession=Depends(get_db), _: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/janelas.py:204`

- **Cadeia de chamadas:**

  - `update_janela()` → `def info(msg: str) -> None` (create_hierarchy_users.py:412)

  - `update_janela()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)



#### `POST /map/features-preview`

- **Implementação:** `async def features_preview(items: list[FeaturePreviewItem], _: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/map_layers.py:53`



#### `GET /map/inom-grid`

- **Implementação:** `async def inom_grid(request: Request, scale: EscalaEnum=Query(..., description='Escala da grade INOM'), tipo_produto: str=Query('CARTA_TOPOGRAFICA', description='Tipo de produto (TipoProduto enum)'), _: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/map_layers.py:16`

- **Cadeia de chamadas:**

  - `inom_grid()` → `def get_grid_gz(tipo_produto: str, scale: EscalaEnum) -> tuple[bytes, str]` (bdgex_service.py:519)



#### `GET /metricas/api`

- **Implementação:** `async def metricas_api(horas: int=Query(24, ge=1, le=720, description='Janela temporal em horas'), db: AsyncSession=Depends(get_db), _: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/metricas.py:132`

- **Cadeia de chamadas:**

  - `metricas_api()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `metricas_api()` → `def _utcnow() -> datetime` (metricas.py:40)



#### `GET /metricas/pedidos`

- **Implementação:** `async def metricas_pedidos(db: AsyncSession=Depends(get_db), _: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/metricas.py:185`

- **Cadeia de chamadas:**

  - `metricas_pedidos()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `metricas_pedidos()` → `def _utcnow() -> datetime` (metricas.py:40)



#### `GET /metricas/resumo`

- **Implementação:** `async def resumo_metricas(db: AsyncSession=Depends(get_db), _: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/metricas.py:49`

- **Cadeia de chamadas:**

  - `resumo_metricas()` → `def _utcnow() -> datetime` (metricas.py:40)

  - `resumo_metricas()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)



#### `GET /om`

- **Implementação:** `async def list_oms()`

- **Arquivo:** `backend/app/routers/om_data.py:25`

- **Cadeia de chamadas:**

  - `list_oms()` → `def _load_oms() -> dict` (om_data.py:11)



#### `POST /oms`

- **Implementação:** `async def criar_om_customizada(body: OmCreateRequest, db: AsyncSession=Depends(get_db), _current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/oms.py:64`



#### `GET /oms/{cmila}`

- **Implementação:** `async def listar_oms_customizadas(cmila: str, db: AsyncSession=Depends(get_db), _current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/oms.py:46`



#### `GET /operacoes`

- **Implementação:** `async def list_operacoes(db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/operacoes.py:35`



#### `POST /operacoes`

- **Implementação:** `async def create_operacao(body: OperacaoCreate, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/operacoes.py:48`



#### `GET /pedidos`

- **Implementação:** `async def list_pedidos(db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/pedidos.py:231`

- **Cadeia de chamadas:**

  - `list_pedidos()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)

  - `list_pedidos()` → `def _rm_do_supervisor(user: Usuario) -> str | None` (pedidos.py:155)



#### `POST /pedidos`

- **Implementação:** `async def create_pedido(body: PedidoCreate, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/pedidos.py:168`

- **Cadeia de chamadas:**

  - `create_pedido()` → `async def get_or_create_config(db: AsyncSession) -> ConfigEntrega` (config.py:44)



#### `GET /pedidos/admin/all`

- **Implementação:** `async def admin_list_all(db: AsyncSession=Depends(get_db), _: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)), status: str | None=Query(default=None), orgao_vinculante: str | None=Query(default=None), q: str | None=Query(default=None))`

- **Arquivo:** `backend/app/routers/pedidos.py:1560`

- **Cadeia de chamadas:**

  - `admin_list_all()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `admin_list_all()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)



#### `POST /pedidos/admin/export`

- **Implementação:** `async def admin_export_geojson(body: ExportRequest, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/pedidos.py:1659`

- **Cadeia de chamadas:**

  - `admin_export_geojson()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `admin_export_geojson()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)

  - `admin_export_geojson()` → `async def _build_admin_zip(enriched: list, current_user: Usuario, filtro: str='Todos') -> StreamingResponse` (pedidos.py:847)



#### `GET /pedidos/admin/produtos-recentes`

- **Implementação:** `async def admin_produtos_recentes_bdgex(anos: int=Query(default=5, ge=1, le=50), db: AsyncSession=Depends(get_db), _: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/pedidos.py:1494`

- **Cadeia de chamadas:**

  - `admin_produtos_recentes_bdgex()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `admin_produtos_recentes_bdgex()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)



#### `DELETE /pedidos/admin/{pedido_id}`

- **Implementação:** `async def admin_delete_pedido(pedido_id: int, db: AsyncSession=Depends(get_db), _: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/pedidos.py:1597`

- **Cadeia de chamadas:**

  - `admin_delete_pedido()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)



#### `PUT /pedidos/admin/{pedido_id}`

- **Implementação:** `async def admin_update_pedido(pedido_id: int, body: AdminPedidoUpdate, db: AsyncSession=Depends(get_db), _: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/pedidos.py:1612`

- **Cadeia de chamadas:**

  - `admin_update_pedido()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `admin_update_pedido()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)

  - `admin_update_pedido()` → `async def registrar_historico(db: AsyncSession, pedido: Pedido, usuario: Usuario | None, acao: str, status_anterior: StatusPedidoEnum | None=None, motivo: str | None=None) -> None` (historico_service.py:26)



#### `GET /pedidos/cgeo-atendimento`

- **Implementação:** `async def cgeo_list_atendimento(db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(require_profiles(PerfilEnum.ANALISTA_CGEO)))`

- **Arquivo:** `backend/app/routers/pedidos.py:1477`

- **Cadeia de chamadas:**

  - `cgeo_list_atendimento()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `cgeo_list_atendimento()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)



#### `POST /pedidos/consolidate`

- **Implementação:** `async def consolidate(body: ConsolidateRequest, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(require_profiles(*GESTOR_PROFILES)))`

- **Arquivo:** `backend/app/routers/pedidos.py:1441`

- **Cadeia de chamadas:**

  - `consolidate()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `consolidate()` → `async def _check_janela_open(db: AsyncSession, user: Usuario) -> None` (pedidos.py:113)

  - `consolidate()` → `async def consolidate_pedidos(db: AsyncSession, pedido_ids: list[int], gestor: Usuario) -> dict` (pedido_service.py:352)



#### `GET /pedidos/duplicatas`

- **Implementação:** `async def listar_duplicatas(db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/pedidos.py:383`

- **Cadeia de chamadas:**

  - `listar_duplicatas()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)

  - `listar_duplicatas()` → `def _rm_do_supervisor(user: Usuario) -> str | None` (pedidos.py:155)



#### `POST /pedidos/enviar-lote`

- **Implementação:** `async def enviar_lote(body: EnviarLoteRequest, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/pedidos.py:1363`

- **Cadeia de chamadas:**

  - `enviar_lote()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)

  - `enviar_lote()` → `async def submit_pedido(db: AsyncSession, pedido: Pedido, current_user: Usuario) -> Pedido` (pedido_service.py:126)



#### `GET /pedidos/export`

- **Implementação:** `async def exportar_pedidos(db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/pedidos.py:1161`

- **Cadeia de chamadas:**

  - `exportar_pedidos()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `exportar_pedidos()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)

  - `exportar_pedidos()` → `async def _build_admin_zip(enriched: list, current_user: Usuario, filtro: str='Todos') -> StreamingResponse` (pedidos.py:847)



#### `GET /pedidos/homologados`

- **Implementação:** `async def list_homologados(db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(require_profiles(*GESTOR_PROFILES)))`

- **Arquivo:** `backend/app/routers/pedidos.py:1297`

- **Cadeia de chamadas:**

  - `list_homologados()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `list_homologados()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)

  - `list_homologados()` → `def _rm_do_supervisor(user: Usuario) -> str | None` (pedidos.py:155)



#### `GET /pedidos/map-features`

- **Implementação:** `async def get_map_features(db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/pedidos.py:319`

- **Cadeia de chamadas:**

  - `get_map_features()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)

  - `get_map_features()` → `def _rm_do_supervisor(user: Usuario) -> str | None` (pedidos.py:155)



#### `GET /pedidos/pending`

- **Implementação:** `async def list_pending(db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/pedidos.py:277`

- **Cadeia de chamadas:**

  - `list_pending()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)

  - `list_pending()` → `def _rm_do_supervisor(user: Usuario) -> str | None` (pedidos.py:155)



#### `GET /pedidos/relatorio`

- **Implementação:** `async def exportar_relatorio(db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(require_profiles(PerfilEnum.SOLICITANTE, *SUPERVISOR_PROFILES, *CONSOLIDADOR_PROFILES)))`

- **Arquivo:** `backend/app/routers/pedidos.py:442`

- **Cadeia de chamadas:**

  - `exportar_relatorio()` → `def _slug(s: str) -> str` (pedidos.py:1130)

  - `exportar_relatorio()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `exportar_relatorio()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)

  - `exportar_relatorio()` → `def _bdgex_info(item) -> tuple[bool, object]` (pedidos.py:494)

  - `exportar_relatorio()` → `def get_inom_geometries(scale: Optional[EscalaEnum]=None) -> dict[str, dict]` (bdgex_service.py:471)

  - `exportar_relatorio()` → `def _rm_do_supervisor(user: Usuario) -> str | None` (pedidos.py:155)



#### `PUT /pedidos/reorder`

- **Implementação:** `async def reorder_pedidos(body: ReorderRequest, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/pedidos.py:1696`



#### `DELETE /pedidos/{pedido_id}`

- **Implementação:** `async def cancel_pedido(pedido_id: int, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/pedidos.py:1872`



#### `GET /pedidos/{pedido_id}`

- **Implementação:** `async def get_pedido(pedido_id: int, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/pedidos.py:1345`

- **Cadeia de chamadas:**

  - `get_pedido()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)



#### `PUT /pedidos/{pedido_id}`

- **Implementação:** `async def update_pedido(pedido_id: int, body: PedidoUpdate, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/pedidos.py:1742`

- **Cadeia de chamadas:**

  - `update_pedido()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)



#### `PUT /pedidos/{pedido_id}/assign-cgeo`

- **Implementação:** `async def assign_cgeo(pedido_id: int, body: AssignCGEORequest, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/pedidos.py:1451`

- **Cadeia de chamadas:**

  - `assign_cgeo()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `assign_cgeo()` → `async def assign_cgeo(db: AsyncSession, pedido: Pedido, cgeo_id: int, dsg: Usuario) -> Pedido` (pedido_service.py:425)



#### `PUT /pedidos/{pedido_id}/cgeo-review`

- **Implementação:** `async def cgeo_review(pedido_id: int, body: CGEOReviewRequest, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(require_profiles(PerfilEnum.ANALISTA_CGEO)))`

- **Arquivo:** `backend/app/routers/pedidos.py:1464`

- **Cadeia de chamadas:**

  - `cgeo_review()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `cgeo_review()` → `async def cgeo_review(db: AsyncSession, pedido: Pedido, cgeo_user: Usuario, acao: str, motivo: str | None, link_bdgex: str | None=None) -> Pedido` (pedido_service.py:470)



#### `POST /pedidos/{pedido_id}/dar-pronto`

- **Implementação:** `async def dar_pronto(pedido_id: int, body: DarProntoRequest, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/pedidos.py:1187`

- **Cadeia de chamadas:**

  - `dar_pronto()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `dar_pronto()` → `async def registrar_historico(db: AsyncSession, pedido: Pedido, usuario: Usuario | None, acao: str, status_anterior: StatusPedidoEnum | None=None, motivo: str | None=None) -> None` (historico_service.py:26)

  - `dar_pronto()` → `async def notify_user(self, usuario_id: int, titulo: str, mensagem: str, pedido_id: int | None=None) -> None` (notification_service.py:39)

  - `dar_pronto()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)

  - `dar_pronto()` → `async def notify_by_perfil(self, perfil: PerfilEnum | frozenset[PerfilEnum], titulo: str, mensagem: str, pedido_id: int | None=None, orgao_vinculante: OrgaoVinculanteEnum | None=None, regiao_militar: str | None=None) -> int` (notification_service.py:65)



#### `GET /pedidos/{pedido_id}/features`

- **Implementação:** `async def get_pedido_features(pedido_id: int, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/pedidos.py:1825`



#### `GET /pedidos/{pedido_id}/historico`

- **Implementação:** `async def get_historico_pedido(pedido_id: int, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/historico.py:50`

- **Cadeia de chamadas:**

  - `get_historico_pedido()` → `async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]` (pedidos.py:52)



#### `PUT /pedidos/{pedido_id}/items/reorder`

- **Implementação:** `async def reorder_items(pedido_id: int, body: ReorderRequest, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/pedidos.py:1716`



#### `DELETE /pedidos/{pedido_id}/items/{item_id}`

- **Implementação:** `async def delete_item(pedido_id: int, item_id: int, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/pedidos.py:1244`

- **Cadeia de chamadas:**

  - `delete_item()` → `def _rm_do_supervisor(user: Usuario) -> str | None` (pedidos.py:155)

  - `delete_item()` → `async def _check_janela_open(db: AsyncSession, user: Usuario) -> None` (pedidos.py:113)



#### `PUT /pedidos/{pedido_id}/review`

- **Implementação:** `async def review(pedido_id: int, body: ReviewPedidoRequest, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(require_profiles(*GESTOR_PROFILES)))`

- **Arquivo:** `backend/app/routers/pedidos.py:1422`

- **Cadeia de chamadas:**

  - `review()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `review()` → `async def review_pedido(db: AsyncSession, pedido: Pedido, gestor: Usuario, acao: str, motivo: str | None, observacoes: str | None=None) -> Pedido` (pedido_service.py:270)

  - `review()` → `async def _check_janela_open(db: AsyncSession, user: Usuario) -> None` (pedidos.py:113)



#### `POST /pedidos/{pedido_id}/solicitar-remocao`

- **Implementação:** `async def solicitar_remocao(pedido_id: int, body: SolicitarRemocaoRequest, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/pedidos.py:1774`



#### `POST /pedidos/{pedido_id}/submit`

- **Implementação:** `async def submit(pedido_id: int, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/pedidos.py:1410`

- **Cadeia de chamadas:**

  - `submit()` → `async def submit_pedido(db: AsyncSession, pedido: Pedido, current_user: Usuario) -> Pedido` (pedido_service.py:126)



#### `GET /transferencias`

- **Implementação:** `async def get_all_transferencias(limit: int=200, offset: int=0, db: AsyncSession=Depends(get_db), _: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/transferencias.py:113`

- **Cadeia de chamadas:**

  - `get_all_transferencias()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `get_all_transferencias()` → `async def _enrich_transferencias(db: AsyncSession, rows: list[PedidoTransferencia]) -> list[TransferenciaOut]` (transferencias.py:39)



#### `GET /transferencias/minhas`

- **Implementação:** `async def get_minhas_transferencias(db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/transferencias.py:77`

- **Cadeia de chamadas:**

  - `get_minhas_transferencias()` → `async def _enrich_transferencias(db: AsyncSession, rows: list[PedidoTransferencia]) -> list[TransferenciaOut]` (transferencias.py:39)



#### `GET /transferencias/usuario/{user_id}`

- **Implementação:** `async def get_usuario_transferencias(user_id: int, db: AsyncSession=Depends(get_db), _: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/transferencias.py:95`

- **Cadeia de chamadas:**

  - `get_usuario_transferencias()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `get_usuario_transferencias()` → `async def _enrich_transferencias(db: AsyncSession, rows: list[PedidoTransferencia]) -> list[TransferenciaOut]` (transferencias.py:39)



#### `GET /users`

- **Implementação:** `async def list_users(db: AsyncSession=Depends(get_db), _: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/users.py:148`

- **Cadeia de chamadas:**

  - `list_users()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)



#### `GET /users/me`

- **Implementação:** `async def get_me(current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/users.py:27`



#### `PUT /users/me`

- **Implementação:** `async def update_me(body: UsuarioUpdateRequest, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/users.py:32`



#### `POST /users/me/confirm-data`

- **Implementação:** `async def confirm_data(db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/users.py:75`



#### `GET /users/me/notifications`

- **Implementação:** `async def get_notifications(db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/users.py:98`



#### `GET /users/me/notifications/unread-count`

- **Implementação:** `async def get_unread_count(db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/users.py:85`



#### `PUT /users/me/notifications/{notif_id}/read`

- **Implementação:** `async def mark_read(notif_id: int, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/users.py:112`



#### `PUT /users/me/password`

- **Implementação:** `async def change_password(body: ChangePasswordRequest, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/users.py:61`

- **Cadeia de chamadas:**

  - `change_password()` → `def get_password_hash(password: str) -> str` (security.py:9)

  - `change_password()` → `def verify_password(plain: str, hashed: str) -> bool` (security.py:13)



#### `GET /users/mesma-om`

- **Implementação:** `async def list_mesma_om(db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/users.py:126`



#### `PUT /users/{user_id}/activate`

- **Implementação:** `async def toggle_activate(user_id: int, db: AsyncSession=Depends(get_db), _: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/users.py:256`

- **Cadeia de chamadas:**

  - `toggle_activate()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `toggle_activate()` → `async def send_email(to: str, subject: str, html_body: str) -> None` (email_service.py:80)



#### `PUT /users/{user_id}/dados-organizacionais`

- **Implementação:** `async def admin_update_dados_org(user_id: int, body: AdminDadosOrgRequest, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/users.py:176`

- **Cadeia de chamadas:**

  - `admin_update_dados_org()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)

  - `admin_update_dados_org()` → `async def send_email(to: str, subject: str, html_body: str) -> None` (email_service.py:80)



#### `PUT /users/{user_id}/profile`

- **Implementação:** `async def update_profile(user_id: int, body: UpdateProfileRequest, db: AsyncSession=Depends(get_db), _: Usuario=Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)))`

- **Arquivo:** `backend/app/routers/users.py:157`

- **Cadeia de chamadas:**

  - `update_profile()` → `def require_profiles(*profiles: PerfilEnum)` (dependencies.py:58)



#### `POST /users/{user_id}/transferir-pedidos`

- **Implementação:** `async def transferir_pedidos(user_id: int, body: TransferirPedidosRequest, db: AsyncSession=Depends(get_db), current_user: Usuario=Depends(get_current_user))`

- **Arquivo:** `backend/app/routers/users.py:228`

- **Cadeia de chamadas:**

  - `transferir_pedidos()` → `async def transferir_pedidos(db: AsyncSession, source_user: Usuario, novo_responsavel: Usuario, executor: Usuario) -> int` (pedido_service.py:566)




## Classes

### AdminDadosOrgRequest

- **Arquivo:** `user.py` (linha 56)

- **Tags:** —

- **Campos:** `om: ?`, `regiao_militar: ?`, `orgao_vinculante: ?`



### AdminPedidoUpdate

- **Arquivo:** `pedidos.py` (linha 40)

- **Tags:** —

- **Campos:** `status: ?`, `data_entrega: ?`, `finalidade: ?`, `observacoes: ?`, `cgeo_id: ?`, `prioridade: ?`



### ApiMetrica

- **Arquivo:** `api_metrica.py` (linha 17)

- **Tags:** —

- **Campos:** `__tablename__: ?`, `__table_args__: ?`, `id: ?`, `method: ?`, `endpoint: ?`, `status_code: ?`



### AssignCGEORequest

- **Arquivo:** `pedido.py` (linha 116)

- **Tags:** —

- **Campos:** `cgeo_id: ?`



### AuditLog

- **Arquivo:** `audit_log.py` (linha 8)

- **Tags:** —

- **Campos:** `__tablename__: ?`, `id: ?`, `usuario_id: ?`, `acao: ?`, `entidade: ?`, `entidade_id: ?`



### Base

- **Arquivo:** `database.py` (linha 32)

- **Tags:** —



### BdgexCache

- **Arquivo:** `bdgex_cache.py` (linha 9)

- **Tags:** —

- **Campos:** `__tablename__: ?`, `__table_args__: ?`, `id: ?`, `inom: ?`, `tipo_produto: ?`, `escala: ?`



### CGEOReviewRequest

- **Arquivo:** `pedido.py` (linha 122)

- **Tags:** —

- **Campos:** `acao: ?`, `motivo: ?`, `link_bdgex: ?`



### ChangePasswordRequest

- **Arquivo:** `user.py` (linha 44)

- **Tags:** —

- **Campos:** `senha_atual: ?`, `nova_senha: ?`



### Config

- **Arquivo:** `config.py` (linha 51)

- **Tags:** —

- **Campos:** `env_file: ?`



### ConfigEntrega

- **Arquivo:** `config_entrega.py` (linha 7)

- **Tags:** —

- **Campos:** `__tablename__: ?`, `id: ?`, `data_base: ?`, `atualizado_em: ?`, `atualizado_por: ?`



### ConfigEntregaOut

- **Arquivo:** `config.py` (linha 58)

- **Tags:** —

- **Campos:** `data_base: ?`, `prazos_minimos: ?`, `datas_minimas: ?`, `atualizado_em: ?`, `model_config: ?`



### ConfigEntregaUpdate

- **Arquivo:** `config.py` (linha 66)

- **Tags:** —

- **Campos:** `data_base: ?`



### ConsolidateRequest

- **Arquivo:** `pedidos.py` (linha 1436)

- **Tags:** —

- **Campos:** `pedido_ids: ?`



### DarProntoRequest

- **Arquivo:** `pedidos.py` (linha 1181)

- **Tags:** —

- **Campos:** `observacoes: ?`, `link_bdgex: ?`



### DuplicateGroup

- **Arquivo:** `pedido.py` (linha 140)

- **Tags:** —

- **Campos:** `inom: ?`, `mi: ?`, `tipo_produto: ?`, `escala: ?`, `pedidos: ?`



### EndpointMetricaOut

- **Arquivo:** `metrica.py` (linha 7)

- **Tags:** —

- **Campos:** `endpoint: ?`, `method: ?`, `total_requests: ?`, `avg_duration_ms: ?`, `max_duration_ms: ?`, `p95_duration_ms: ?`



### EnviarLoteRequest

- **Arquivo:** `pedidos.py` (linha 1357)

- **Tags:** —

- **Campos:** `auto_submitted: ?`, `pedido_ids: ?`



### EscalaEnum

- **Arquivo:** `enums.py` (linha 92)

- **Tags:** —

- **Campos:** `E25K: ?`, `E50K: ?`, `E100K: ?`, `E250K: ?`



### ExportRequest

- **Arquivo:** `pedidos.py` (linha 35)

- **Tags:** —

- **Campos:** `pedido_ids: ?`, `status_filter: ?`



### FeaturePreviewItem

- **Arquivo:** `map_layers.py` (linha 46)

- **Tags:** —

- **Campos:** `inom: ?`, `escala: ?`, `tipo_produto: ?`



### ForgotPasswordRequest

- **Arquivo:** `auth.py` (linha 60)

- **Tags:** —

- **Campos:** `email: ?`



### HoraMetricaOut

- **Arquivo:** `metrica.py` (linha 21)

- **Tags:** —

- **Campos:** `hora: ?`, `total: ?`, `erros: ?`



### ItemPedido

- **Arquivo:** `pedido.py` (linha 67)

- **Tags:** —

- **Campos:** `__tablename__: ?`, `id: ?`, `pedido_id: ?`, `tipo_produto: ?`, `escala: ?`, `inom: ?`



### ItemPedidoCreate

- **Arquivo:** `pedido.py` (linha 13)

- **Tags:** —

- **Campos:** `tipo_produto: ?`, `escala: ?`, `inom: ?`, `mi: ?`, `solicitar_mesmo_disponivel: ?`, `impressao_quantidade: ?`



### ItemPedidoOut

- **Arquivo:** `pedido.py` (linha 25)

- **Tags:** —

- **Campos:** `id: ?`, `tipo_produto: ?`, `escala: ?`, `inom: ?`, `mi: ?`, `disponivel_bdgex: ?`



### JanelaCreate

- **Arquivo:** `janelas.py` (linha 47)

- **Tags:** —

- **Campos:** `tipo_janela: ?`, `data_inicio: ?`, `data_fim: ?`, `ano_referencia: ?`



### JanelaOut

- **Arquivo:** `janelas.py` (linha 59)

- **Tags:** —

- **Campos:** `id: ?`, `tipo_janela: ?`, `data_inicio: ?`, `data_fim: ?`, `ano_referencia: ?`, `model_config: ?`



### JanelaPedidos

- **Arquivo:** `janela.py` (linha 8)

- **Tags:** —

- **Campos:** `__tablename__: ?`, `__table_args__: ?`, `id: ?`, `tipo_janela: ?`, `data_inicio: ?`, `data_fim: ?`



### JanelaUpdate

- **Arquivo:** `janelas.py` (linha 54)

- **Tags:** —

- **Campos:** `data_inicio: ?`, `data_fim: ?`



### LoginRequest

- **Arquivo:** `auth.py` (linha 46)

- **Tags:** —

- **Campos:** `email: ?`, `senha: ?`



### MesCountOut

- **Arquivo:** `metrica.py` (linha 47)

- **Tags:** —

- **Campos:** `mes: ?`, `count: ?`



### MinhaJanelaOut

- **Arquivo:** `janelas.py` (linha 68)

- **Tags:** —

- **Campos:** `aberta: ?`, `data_inicio: ?`, `data_fim: ?`, `tipo_janela: ?`, `dias_restantes: ?`, `configurada: ?`



### Notificacao

- **Arquivo:** `notificacao.py` (linha 7)

- **Tags:** —

- **Campos:** `__tablename__: ?`, `id: ?`, `usuario_id: ?`, `titulo: ?`, `mensagem: ?`, `lida: ?`



### NotificacaoOut

- **Arquivo:** `user.py` (linha 63)

- **Tags:** —

- **Campos:** `id: ?`, `titulo: ?`, `mensagem: ?`, `lida: ?`, `pedido_id: ?`, `criado_em: ?`



### NotificationService

- **Arquivo:** `notification_service.py` (linha 28)

- **Tags:** —

- **Métodos:** `__init__()`, `notify_user()`, `notify_by_perfil()`



### OmCreateRequest

- **Arquivo:** `oms.py` (linha 22)

- **Tags:** —

- **Campos:** `cmila: ?`, `nome: ?`

- **Métodos:** `cmila_valido()`, `nome_valido()`



### OmCustomizada

- **Arquivo:** `om_customizada.py` (linha 7)

- **Tags:** —

- **Campos:** `__tablename__: ?`, `id: ?`, `cmila: ?`, `nome: ?`, `criado_em: ?`



### Operacao

- **Arquivo:** `operacao.py` (linha 7)

- **Tags:** —

- **Campos:** `__tablename__: ?`, `id: ?`, `nome: ?`, `om: ?`, `criado_por: ?`, `criado_em: ?`



### OperacaoCreate

- **Arquivo:** `operacoes.py` (linha 13)

- **Tags:** —

- **Campos:** `nome: ?`

- **Métodos:** `validate_nome()`



### OperacaoOut

- **Arquivo:** `operacoes.py` (linha 27)

- **Tags:** —

- **Campos:** `id: ?`, `nome: ?`, `om: ?`, `model_config: ?`



### OrgaoVinculanteCountOut

- **Arquivo:** `metrica.py` (linha 36)

- **Tags:** —

- **Campos:** `orgao_vinculante: ?`, `count: ?`



### OrgaoVinculanteEnum

- **Arquivo:** `enums.py` (linha 57)

- **Tags:** —

- **Campos:** `DSG: ?`, `DCT: ?`, `COTER: ?`, `DEC: ?`, `COLOG: ?`, `DECEx: ?`



### Pedido

- **Arquivo:** `pedido.py` (linha 9)

- **Tags:** —

- **Campos:** `__tablename__: ?`, `id: ?`, `usuario_id: ?`, `criador_id: ?`, `operacao_id: ?`, `data_entrega: ?`



### PedidoCreate

- **Arquivo:** `pedido.py` (linha 41)

- **Tags:** —

- **Campos:** `operacao_id: ?`, `data_entrega: ?`, `finalidade_geo: ?`, `finalidade: ?`, `orgao_vinculante: ?`, `itens: ?`



### PedidoHistorico

- **Arquivo:** `pedido_historico.py` (linha 15)

- **Tags:** —

- **Campos:** `__tablename__: ?`, `__table_args__: ?`, `id: ?`, `pedido_id: ?`, `status_anterior: ?`, `status_novo: ?`



### PedidoHistoricoOut

- **Arquivo:** `historico.py` (linha 8)

- **Tags:** —

- **Campos:** `id: ?`, `pedido_id: ?`, `status_anterior: ?`, `status_novo: ?`, `usuario_id: ?`, `usuario_nome: ?`



### PedidoOut

- **Arquivo:** `pedido.py` (linha 60)

- **Tags:** —

- **Campos:** `id: ?`, `usuario_id: ?`, `operacao_id: ?`, `data_entrega: ?`, `status: ?`, `prioridade: ?`



### PedidoTransferencia

- **Arquivo:** `pedido_transferencia.py` (linha 22)

- **Tags:** —

- **Campos:** `__tablename__: ?`, `__table_args__: ?`, `id: ?`, `pedido_id: ?`, `de_usuario_id: ?`, `para_usuario_id: ?`



### PedidoUpdate

- **Arquivo:** `pedido.py` (linha 53)

- **Tags:** —

- **Campos:** `operacao_id: ?`, `data_entrega: ?`, `finalidade_geo: ?`, `finalidade: ?`



### PedidosMetricasOut

- **Arquivo:** `metrica.py` (linha 72)

- **Tags:** —

- **Campos:** `total_pedidos: ?`, `pedidos_por_status: ?`, `pedidos_por_orgao_vinculante: ?`, `evolucao_mensal: ?`, `tempo_medio_tramitacao_horas: ?`



### PerfilEnum

- **Arquivo:** `enums.py` (linha 4)

- **Tags:** —

- **Campos:** `SOLICITANTE: ?`, `SUPERVISOR_CMP: ?`, `SUPERVISOR_CML: ?`, `SUPERVISOR_CMS: ?`, `SUPERVISOR_CMO: ?`, `SUPERVISOR_CMAO: ?`



### PostoGraduacaoEnum

- **Arquivo:** `enums.py` (linha 108)

- **Tags:** —

- **Campos:** `TERCEIRO_SGT: ?`, `SEGUNDO_SGT: ?`, `PRIMEIRO_SGT: ?`, `SUBTENENTE: ?`, `ASPIRANTE: ?`, `SEGUNDO_TEN: ?`



### ProrrogacaoRequest

- **Arquivo:** `janelas.py` (linha 225)

- **Tags:** —

- **Campos:** `justificativa: ?`, `produtos_desejados: ?`



### RegisterRequest

- **Arquivo:** `auth.py` (linha 8)

- **Tags:** —

- **Campos:** `nome: ?`, `nome_de_guerra: ?`, `email: ?`, `telefone: ?`, `telefone_ritex: ?`, `om: ?`

- **Métodos:** `validate_email()`, `validate_senha()`, `validate_nome()`



### ReorderRequest

- **Arquivo:** `pedido.py` (linha 136)

- **Tags:** —

- **Campos:** `ordered_ids: ?`



### ResendActivationRequest

- **Arquivo:** `auth.py` (linha 56)

- **Tags:** —

- **Campos:** `email: ?`



### ResetPasswordRequest

- **Arquivo:** `auth.py` (linha 64)

- **Tags:** —

- **Campos:** `token: ?`, `nova_senha: ?`

- **Métodos:** `validate_senha()`



### ResumoMetricasOut

- **Arquivo:** `metrica.py` (linha 54)

- **Tags:** —

- **Campos:** `total_requests_24h: ?`, `avg_response_ms: ?`, `error_rate_24h: ?`, `endpoints_ativos: ?`, `total_pedidos: ?`, `pedidos_por_status: ?`



### ReviewPedidoRequest

- **Arquivo:** `pedido.py` (linha 102)

- **Tags:** —

- **Campos:** `acao: ?`, `motivo: ?`, `observacoes: ?`



### Settings

- **Arquivo:** `config.py` (linha 10)

- **Tags:** —

- **Campos:** `DB_HOST: ?`, `DB_PORT: ?`, `DB_USER: ?`, `DB_PASSWORD: ?`, `DB_NAME: ?`, `DATABASE_URL: ?`

- **Métodos:** `build_database_url()`, `validate_production_secrets()`



### SolicitarRemocaoRequest

- **Arquivo:** `pedidos.py` (linha 1737)

- **Tags:** —

- **Campos:** `justificativa: ?`



### StatusCountOut

- **Arquivo:** `metrica.py` (linha 29)

- **Tags:** —

- **Campos:** `status: ?`, `count: ?`



### StatusPedidoEnum

- **Arquivo:** `enums.py` (linha 66)

- **Tags:** —

- **Campos:** `RASCUNHO: ?`, `AGUARDANDO_SUPERVISOR: ?`, `AGUARDANDO_CONSOLIDADOR: ?`, `DEVOLVIDO: ?`, `AGUARDANDO_CARTOGRAFICO: ?`, `ATRIBUIDO_CGEO: ?`



### TestAdminFlow

- **Arquivo:** `test_api_integration.py` (linha 107)

- **Tags:** —

- **Métodos:** `token()`, `test_login_admin_retorna_token()`, `test_listar_janelas_autenticado()`, `test_listar_pedidos_autenticado()`, `test_listar_usuarios_autenticado()`, `test_perfil_sem_permissao_retorna_403()`



### TestAssignCgeo

- **Arquivo:** `test_pedido_service.py` (linha 153)

- **Tags:** —

- **Métodos:** `test_status_invalido_levanta_400()`, `test_atribuicao_bem_sucedida()`



### TestAuthPublico

- **Arquivo:** `test_api_integration.py` (linha 44)

- **Tags:** —

- **Métodos:** `test_login_credenciais_invalidas_retorna_401()`, `test_login_payload_incompleto_retorna_422()`, `test_registro_email_invalido_retorna_422()`, `test_forgot_password_sempre_200()`, `test_confirm_token_invalido_retorna_400()`



### TestAuthenticateUser

- **Arquivo:** `test_auth_service.py` (linha 123)

- **Tags:** —

- **Métodos:** `test_email_nao_encontrado_levanta_401()`, `test_conta_bloqueada_levanta_403()`, `test_senha_incorreta_levanta_401()`, `test_login_bem_sucedido_retorna_token()`, `test_senha_expirada_levanta_403()`



### TestCgeoReview

- **Arquivo:** `test_pedido_service.py` (linha 176)

- **Tags:** —

- **Métodos:** `test_status_invalido_levanta_400()`, `test_acao_invalida_levanta_400()`, `test_aprovacao_envia_email_ao_solicitante()`, `test_reprovacao_registra_motivo()`



### TestConfirmEmail

- **Arquivo:** `test_auth_service.py` (linha 87)

- **Tags:** —

- **Métodos:** `test_token_invalido_levanta_400()`, `test_confirmacao_bem_sucedida()`



### TestConsolidatePedidos

- **Arquivo:** `test_pedido_service.py` (linha 115)

- **Tags:** —

- **Métodos:** `test_perfil_nao_autorizado_levanta_403()`, `test_consolidacao_avanca_pedidos_validos()`, `test_pedido_com_status_errado_e_ignorado()`



### TestHealth

- **Arquivo:** `test_api_integration.py` (linha 30)

- **Tags:** —

- **Métodos:** `test_health_retorna_ok()`



### TestHerancaPedidos

- **Arquivo:** `test_api_integration.py` (linha 164)

- **Tags:** —

- **Campos:** `GUSTAVO_EMAIL: ?`, `GUSTAVO_SENHA: ?`, `JOAO_EMAIL: ?`, `JOAO_SENHA: ?`

- **Métodos:** `tokens()`, `admin_token()`, `pedido_id()`, `test_login_gustavo_retorna_token()`, `test_login_joao_retorna_token()`, `test_gustavo_cria_pedido()`, `test_gustavo_ve_colegas_mesma_om()`, `test_joao_nao_ve_admin_em_mesma_om()`



### TestNotifyByPerfil

- **Arquivo:** `test_notification_service.py` (linha 39)

- **Tags:** —

- **Métodos:** `test_notifica_todos_os_usuarios_do_perfil()`, `test_retorna_zero_sem_usuarios()`, `test_filtra_por_orgao_vinculante_quando_fornecido()`



### TestNotifyUser

- **Arquivo:** `test_notification_service.py` (linha 22)

- **Tags:** —

- **Métodos:** `test_adiciona_notificacao_ao_db()`, `test_pedido_id_opcional()`



### TestProtecaoSemToken

- **Arquivo:** `test_api_integration.py` (linha 85)

- **Tags:** —

- **Campos:** `endpoints: ?`

- **Métodos:** `test_sem_token_retorna_403_ou_401()`



### TestRegisterUser

- **Arquivo:** `test_auth_service.py` (linha 22)

- **Tags:** —

- **Métodos:** `test_email_duplicado_levanta_400()`, `test_cadastro_bem_sucedido()`, `test_cadastro_com_nome_de_guerra()`



### TestRequestPasswordReset

- **Arquivo:** `test_auth_service.py` (linha 201)

- **Tags:** —

- **Métodos:** `test_email_desconhecido_silencioso()`, `test_limite_diario_levanta_429()`



### TestResetPassword

- **Arquivo:** `test_auth_service.py` (linha 224)

- **Tags:** —

- **Métodos:** `test_token_invalido_levanta_400()`, `test_redefinicao_bem_sucedida()`



### TestReviewPedido

- **Arquivo:** `test_pedido_service.py` (linha 69)

- **Tags:** —

- **Métodos:** `test_status_invalido_levanta_400()`, `test_acao_invalida_levanta_400()`, `test_aprovar_avanca_para_aguardando_consolidador()`, `test_reprovar_cancela_e_envia_email()`, `test_observacoes_sao_salvas()`



### TestSubmitPedido

- **Arquivo:** `test_pedido_service.py` (linha 21)

- **Tags:** —

- **Métodos:** `test_pedido_ja_submetido_levanta_400()`, `test_pedido_de_outro_usuario_levanta_403()`, `test_pedido_sem_itens_levanta_400()`, `test_perfil_nao_autorizado_levanta_403()`, `test_submit_bem_sucedido_avanca_status()`



### TipoJanelaEnum

- **Arquivo:** `enums.py` (linha 99)

- **Tags:** —

- **Campos:** `SOLICITANTE: ?`, `SUPERVISOR: ?`, `CONSOLIDADOR: ?`, `GESTOR_CARTOGRAFICO: ?`, `ANALISTA_CGEO: ?`, `GESTOR_CARTOGRAFICO_FINAL: ?`



### TipoProdutoEnum

- **Arquivo:** `enums.py` (linha 80)

- **Tags:** —

- **Campos:** `CARTA_TOPOGRAFICA: ?`, `CARTA_ORTOIMAGEM: ?`, `ORTOIMAGEM: ?`, `MDT: ?`, `MDS: ?`, `CDGV: ?`



### TokenResponse

- **Arquivo:** `auth.py` (linha 51)

- **Tags:** —

- **Campos:** `access_token: ?`, `token_type: ?`



### TokenSenha

- **Arquivo:** `user.py` (linha 49)

- **Tags:** —

- **Campos:** `__tablename__: ?`, `id: ?`, `usuario_id: ?`, `token: ?`, `expira_em: ?`, `usado: ?`



### TransferenciaOut

- **Arquivo:** `transferencias.py` (linha 24)

- **Tags:** —

- **Campos:** `id: ?`, `pedido_id: ?`, `de_usuario_id: ?`, `de_usuario_nome: ?`, `para_usuario_id: ?`, `para_usuario_nome: ?`



### TransferirPedidosRequest

- **Arquivo:** `pedido.py` (linha 7)

- **Tags:** —

- **Campos:** `novo_responsavel_id: ?`



### UpdateProfileRequest

- **Arquivo:** `user.py` (linha 49)

- **Tags:** —

- **Campos:** `perfil: ?`, `orgao_vinculante: ?`, `cgeo_id: ?`, `regiao_militar: ?`



### Usuario

- **Arquivo:** `user.py` (linha 8)

- **Tags:** —

- **Campos:** `__tablename__: ?`, `id: ?`, `nome: ?`, `nome_de_guerra: ?`, `email: ?`, `telefone: ?`



### UsuarioOut

- **Arquivo:** `user.py` (linha 6)

- **Tags:** —

- **Campos:** `id: ?`, `nome: ?`, `nome_de_guerra: ?`, `email: ?`, `telefone: ?`, `telefone_ritex: ?`



### UsuarioUpdateRequest

- **Arquivo:** `user.py` (linha 33)

- **Tags:** —

- **Campos:** `nome_de_guerra: ?`, `telefone: ?`, `telefone_ritex: ?`, `secao_om: ?`, `om: ?`, `regiao_militar: ?`




## Guia para Agentes de IA

Este documento é gerado automaticamente pelo **Code Atlas**. Use-o junto com a ferramenta `atlas_get_context` para navegar no grafo.

### API de Contexto (para Agentes)


O servidor Code Atlas expõe endpoints de contexto estruturado:


| Endpoint | Descrição |

|----------|-----------|

| `GET /api/context/{node_id}` | ContextPackage completo de um nó (callers, callees, deps, endpoints) |

| `GET /api/node/{node_id}` | Dados do nó + arestas conectadas |

| `GET /api/search?q=nome` | Busca por label, tipo, tag ou arquivo |

| `GET /api/graph` | Grafo completo em formato Cytoscape JSON |

| `GET /api/docs/raw` | Este documento como JSON `{"markdown": ...}` |


> **Dica para IAs:** Para diagnosticar um bug em qualquer endpoint, consulte primeiro
> `GET /api/context/{method_node_id}` do método do Controller. O campo
> `structural_context.callees` mostra quais métodos do Service são chamados.
> Depois consulte o context do método do Service para ver seus `depends_on`
> (que apontam para Models/DTOs com possíveis erros de mapping).


### Como Rastrear uma Requisição

Para entender o fluxo completo de qualquer endpoint:
1. Encontre o endpoint na tabela acima
2. Localize o método Java correspondente no Controller
3. Siga as arestas `CALLS` para o(s) Service(s)
4. Verifique os DTOs de entrada/saída
5. O Model/Entity é o objeto central de domínio


### Onde Procurar por Tipo de Problema


| Problema | Onde Verificar |

|----------|----------------|

| Bug no retorno de dados | Service + método `toResponseDTO()` |

| Erro de validação (400) | Service + RequestDTO |

| Endpoint não encontrado (404) | Controller + `@RequestMapping` |

| Erro na estrutura do endpoint | Controller + `@GetMapping`/`@PostMapping` |

| Dados incorretos na resposta | Service + ResponseDTO |

| Problema de persistência | Repository + Model/Entity |

