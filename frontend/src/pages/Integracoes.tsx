import { useState } from 'react'
import { ExternalLink, ChevronDown, ChevronRight, Lock, Globe } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  description: string
  auth: boolean
  profiles?: string[]
  body?: unknown
  response?: unknown
  queryParams?: { name: string; type: string; desc: string }[]
}

interface ApiGroup {
  id: string
  name: string
  description: string
  endpoints: Endpoint[]
}

// ─── Dados ────────────────────────────────────────────────────────────────────

const API_GROUPS: ApiGroup[] = [
  {
    id: 'auth',
    name: '🔐 Autenticação',
    description: 'Registro, confirmação de e-mail, login e redefinição de senha.',
    endpoints: [
      {
        method: 'POST', path: '/api/v1/auth/register', description: 'Cadastra novo usuário (e-mail @eb.mil.br obrigatório). Envia link de ativação por e-mail.', auth: false,
        body: { nome: 'string', email: 'string (@eb.mil.br)', telefone: 'string', om: 'string', secao_om: 'string', senha: 'string (≥8 chars, 1 maiúscula, 1 número, 1 especial)', regiao_militar: 'string (opcional)' },
        response: { message: 'Cadastro realizado. Verifique seu email para ativar a conta.' },
      },
      {
        method: 'GET', path: '/api/v1/auth/confirm-email/{token}', description: 'Ativa a conta do usuário via token enviado por e-mail.', auth: false,
        response: { message: 'Email confirmado. Bem-vindo, {nome}!' },
      },
      {
        method: 'POST', path: '/api/v1/auth/login', description: 'Autentica o usuário e retorna JWT de acesso (validade 8h).', auth: false,
        body: { email: 'string', senha: 'string' },
        response: { access_token: 'eyJ…', token_type: 'bearer' },
      },
      {
        method: 'POST', path: '/api/v1/auth/forgot-password', description: 'Solicita e-mail de redefinição de senha. Sempre retorna 200 (segurança).', auth: false,
        body: { email: 'string' },
        response: { message: 'Se o email estiver cadastrado, você receberá as instruções.' },
      },
      {
        method: 'POST', path: '/api/v1/auth/reset-password', description: 'Redefine a senha usando token recebido por e-mail (válido por 1h).', auth: false,
        body: { token: 'string', nova_senha: 'string' },
        response: { message: 'Senha redefinida com sucesso.' },
      },
    ],
  },
  {
    id: 'pedidos',
    name: '📋 Pedidos',
    description: 'CRUD de pedidos de produtos geoinformacionais e operações do fluxo.',
    endpoints: [
      {
        method: 'POST', path: '/api/v1/pedidos/', description: 'Cria pedido em rascunho com itens (INOM + escala + produto).', auth: true, profiles: ['SOLICITANTE'],
        body: { operacao_id: 'int (opcional)', data_entrega: 'YYYY-MM-DD', finalidade: 'string', itens: [{ tipo_produto: 'TipoProdutoEnum', escala: 'EscalaEnum', inom: 'string', mi: 'string', solicitar_mesmo_disponivel: false }] },
        response: { id: 1, status: 'RASCUNHO', itens: [] },
      },
      {
        method: 'GET', path: '/api/v1/pedidos/', description: 'Lista pedidos do usuário autenticado.', auth: true,
        queryParams: [{ name: 'status', type: 'string', desc: 'Filtrar por status' }],
        response: [{ id: 1, status: 'RASCUNHO', orgao_vinculante: 'COTER', itens: [] }],
      },
      {
        method: 'GET', path: '/api/v1/pedidos/{pedido_id}', description: 'Detalhe de um pedido específico.', auth: true,
        response: { id: 1, status: 'RASCUNHO', usuario_id: 1, itens: [] },
      },
      {
        method: 'PUT', path: '/api/v1/pedidos/{pedido_id}', description: 'Edita metadados de pedido em rascunho ou devolvido pelo gestor.', auth: true,
        body: { operacao_id: 'int', data_entrega: 'YYYY-MM-DD', finalidade: 'string' },
        response: { id: 1, status: 'RASCUNHO' },
      },
      {
        method: 'POST', path: '/api/v1/pedidos/{pedido_id}/submit', description: 'Submete pedido para o próximo escalão do fluxo.', auth: true, profiles: ['SOLICITANTE', 'SUPERVISOR', 'CONSOLIDADOR'],
        response: { id: 1, status: 'AGUARDANDO_SUPERVISOR' },
      },
      {
        method: 'PUT', path: '/api/v1/pedidos/{pedido_id}/review', description: 'Revisa um pedido individualmente (aprovar, devolver para revisão ou reprovar).', auth: true, profiles: ['SUPERVISOR', 'CONSOLIDADOR'],
        body: { acao: '"aprovar" | "editar" | "reprovar"', motivo: 'string (obrigatório ao reprovar)', observacoes: 'string' },
        response: { id: 1, status: 'AGUARDANDO_CONSOLIDADOR' },
      },
      {
        method: 'POST', path: '/api/v1/pedidos/consolidate', description: 'Consolida e encaminha um lote de pedidos para o próximo escalão.', auth: true, profiles: ['SUPERVISOR', 'CONSOLIDADOR'],
        body: { pedido_ids: [1, 2, 3] },
        response: { submetidos: 3 },
      },
      {
        method: 'PUT', path: '/api/v1/pedidos/{pedido_id}/assign-cgeo', description: 'Atribui pedido a um CGEO para análise de viabilidade.', auth: true, profiles: ['GESTOR_CARTOGRAFICO'],
        body: { cgeo_id: 1 },
        response: { id: 1, status: 'ATRIBUIDO_CGEO', cgeo_id: 1 },
      },
      {
        method: 'PUT', path: '/api/v1/pedidos/{pedido_id}/cgeo-review', description: 'Registra análise de viabilidade do CGEO (aprovar = atender, reprovar = inviável).', auth: true, profiles: ['ANALISTA_CGEO'],
        body: { acao: '"aprovar" | "reprovar"', motivo: 'string (obrigatório ao reprovar)' },
        response: { id: 1, status: 'APROVADO' },
      },
      {
        method: 'GET', path: '/api/v1/pedidos/{pedido_id}/historico', description: 'Histórico completo de transições de status do pedido.', auth: true,
        response: [{ id: 1, acao: 'submeter', status_anterior: 'RASCUNHO', status_novo: 'AGUARDANDO_SUPERVISOR', usuario_nome: 'Usuário', criado_em: '2025-01-01T10:00:00Z' }],
      },
      {
        method: 'POST', path: '/api/v1/pedidos/{pedido_id}/solicitar-remocao', description: 'Notifica gestor sobre solicitação de remoção de pedido já encaminhado.', auth: true,
        body: { justificativa: 'string' },
        response: { detail: 'Notificação enviada ao gestor.' },
      },
      {
        method: 'DELETE', path: '/api/v1/pedidos/{pedido_id}', description: 'Cancela e remove pedido em rascunho ou devolvido pelo gestor.', auth: true,
        response: { message: 'Pedido cancelado.' },
      },
    ],
  },
  {
    id: 'gestores',
    name: '👥 Gestão de Pedidos',
    description: 'Endpoints para gestores visualizarem pedidos pendentes e o histórico global.',
    endpoints: [
      {
        method: 'GET', path: '/api/v1/pedidos/pending', description: 'Lista pedidos pendentes de revisão para o perfil do usuário autenticado.', auth: true, profiles: ['SUPERVISOR', 'CONSOLIDADOR', 'GESTOR_CARTOGRAFICO', 'ANALISTA_CGEO'],
        response: [{ id: 1, status: 'AGUARDANDO_SUPERVISOR' }],
      },
      {
        method: 'GET', path: '/api/v1/pedidos/admin/all', description: 'Lista todos os pedidos do sistema (Gestor Cartográfico/DSG).', auth: true, profiles: ['GESTOR_CARTOGRAFICO'],
        queryParams: [{ name: 'status', type: 'string', desc: 'Filtrar por status' }, { name: 'orgao_vinculante', type: 'string', desc: 'Filtrar por órgão vinculante' }],
        response: [{ id: 1, status: 'APROVADO', usuario_nome: 'Usuário' }],
      },
      {
        method: 'DELETE', path: '/api/v1/pedidos/admin/{pedido_id}', description: 'Remove permanentemente qualquer pedido (Gestor Cartográfico/DSG).', auth: true, profiles: ['GESTOR_CARTOGRAFICO'],
        response: { message: 'Pedido removido.' },
      },
      {
        method: 'GET', path: '/api/v1/historico', description: 'Histórico global de todos os pedidos — auditoria completa.', auth: true, profiles: ['GESTOR_CARTOGRAFICO'],
        queryParams: [{ name: 'limit', type: 'int', desc: 'Máximo de registros (padrão 200)' }, { name: 'offset', type: 'int', desc: 'Paginação (padrão 0)' }],
        response: [{ id: 1, pedido_id: 5, acao: 'aprovar', status_novo: 'AGUARDANDO_CARTOGRAFICO', usuario_nome: 'Gestor', criado_em: '2025-01-01T10:00:00Z' }],
      },
    ],
  },
  {
    id: 'mapas',
    name: '🗺 Mapas e Camadas',
    description: 'Grade INOM, camadas BDGEx e GeoJSON de pedidos para visualização no mapa.',
    endpoints: [
      {
        method: 'GET', path: '/api/v1/map/inom-grid', description: 'Retorna grade INOM como GeoJSON (shapefile 1:50.000 ou grade sintética para outras escalas).', auth: true,
        queryParams: [{ name: 'scale', type: 'string', desc: 'Ex: 1:50.000, 1:25.000, 1:100.000' }],
        response: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { inom: 'SE-22-X-B-I-3', mi: '2955-3' }, geometry: {} }] },
      },
      {
        method: 'GET', path: '/api/v1/map/bdgex-layer', description: 'Disponibilidade de produtos no BDGEx para as células INOM solicitadas.', auth: true,
        queryParams: [{ name: 'inoms', type: 'string[]', desc: 'Lista de INOMs' }, { name: 'scale', type: 'string', desc: 'Escala' }, { name: 'tipo_produto', type: 'string', desc: 'Tipo de produto' }],
        response: { 'SE-22': { disponivel: true, data_producao: '2022-03-15' } },
      },
      {
        method: 'GET', path: '/api/v1/pedidos/map-features', description: 'GeoJSON com todos os pedidos do usuário para sobreposição no mapa.', auth: true,
        response: { type: 'FeatureCollection', features: [] },
      },
      {
        method: 'GET', path: '/api/v1/pedidos/{pedido_id}/features', description: 'GeoJSON dos itens de um pedido específico para espacialização.', auth: true,
        response: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { inom: 'SE-22', status: 'APROVADO' }, geometry: {} }] },
      },
    ],
  },
  {
    id: 'usuarios',
    name: '👤 Usuários',
    description: 'Perfil do usuário autenticado e gerenciamento administrativo.',
    endpoints: [
      {
        method: 'GET', path: '/api/v1/users/me', description: 'Retorna dados do usuário autenticado.', auth: true,
        response: { id: 1, nome: 'Usuário', email: 'user@eb.mil.br', perfil: 'SOLICITANTE', orgao_vinculante: 'COTER' },
      },
      {
        method: 'PUT', path: '/api/v1/users/me', description: 'Atualiza nome, telefone, seção e OM do usuário.', auth: true,
        body: { nome: 'string', telefone: 'string', secao_om: 'string', om: 'string' },
        response: { id: 1, nome: 'Novo Nome' },
      },
      {
        method: 'PUT', path: '/api/v1/users/me/password', description: 'Altera senha do usuário autenticado.', auth: true,
        body: { senha_atual: 'string', nova_senha: 'string' },
        response: { message: 'Senha alterada com sucesso.' },
      },
      {
        method: 'GET', path: '/api/v1/users/me/notifications', description: 'Lista notificações in-app do usuário.', auth: true,
        response: [{ id: 1, titulo: 'Pedido aprovado', mensagem: '…', lida: false, criado_em: '…' }],
      },
      {
        method: 'GET', path: '/api/v1/users/', description: 'Lista todos os usuários (Gestor Cartográfico/DSG).', auth: true, profiles: ['GESTOR_CARTOGRAFICO'],
        response: [{ id: 1, nome: 'Usuário', perfil: 'SOLICITANTE', ativo: true }],
      },
      {
        method: 'PUT', path: '/api/v1/users/{user_id}/profile', description: 'Atualiza perfil, orgao_vinculante e CGEO de um usuário.', auth: true, profiles: ['GESTOR_CARTOGRAFICO'],
        body: { perfil: 'PerfilEnum', orgao_vinculante: 'OrgaoVinculanteEnum', cgeo_id: 'int (opcional)' },
        response: { id: 1, perfil: 'SUPERVISOR' },
      },
      {
        method: 'PUT', path: '/api/v1/users/{user_id}/activate', description: 'Ativa ou desativa a conta de um usuário.', auth: true, profiles: ['GESTOR_CARTOGRAFICO'],
        body: { ativo: true },
        response: { id: 1, ativo: true },
      },
    ],
  },
  {
    id: 'janelas',
    name: '📅 Janelas de Pedidos',
    description: 'Controle temporal de abertura e fechamento de cada etapa do ciclo anual.',
    endpoints: [
      {
        method: 'GET', path: '/api/v1/janelas/', description: 'Lista todas as janelas cadastradas.', auth: true,
        response: [{ id: 1, tipo_janela: 'SOLICITANTE', data_inicio: '2025-02-01', data_fim: '2025-03-31', ano_referencia: 2025 }],
      },
      {
        method: 'GET', path: '/api/v1/janelas/active', description: 'Retorna janelas abertas no momento da requisição.', auth: true,
        response: [{ id: 1, tipo_janela: 'SOLICITANTE', data_inicio: '…', data_fim: '…' }],
      },
      {
        method: 'POST', path: '/api/v1/janelas/', description: 'Cria nova janela temporal (Gestor Cartográfico/DSG).', auth: true, profiles: ['GESTOR_CARTOGRAFICO'],
        body: { tipo_janela: 'TipoJanelaEnum', data_inicio: 'ISO datetime', data_fim: 'ISO datetime', ano_referencia: 2025 },
        response: { id: 2, tipo_janela: 'CONSOLIDADOR' },
      },
      {
        method: 'POST', path: '/api/v1/janelas/solicitar-prorrogacao', description: 'Solicita prorrogação de prazo ao escalão superior (notificação in-app).', auth: true,
        body: { justificativa: 'string', produtos_desejados: 'string' },
        response: { detail: 'Solicitação enviada a 2 gestor(es).' },
      },
      {
        method: 'DELETE', path: '/api/v1/janelas/{janela_id}', description: 'Remove uma janela (Gestor Cartográfico/DSG).', auth: true, profiles: ['GESTOR_CARTOGRAFICO'],
        response: { message: 'Janela removida.' },
      },
    ],
  },
  {
    id: 'metricas',
    name: '📊 Métricas',
    description: 'Performance da API e KPIs de negócio dos pedidos. Acesso exclusivo ao Gestor Cartográfico (DSG).',
    endpoints: [
      {
        method: 'GET', path: '/api/v1/metricas/resumo', description: 'Dashboard unificado: cards de API (24h) + série temporal hora a hora + pedidos por status.', auth: true, profiles: ['GESTOR_CARTOGRAFICO'],
        response: { total_requests_24h: 3200, avg_response_ms: 42.5, error_rate_24h: 0.012, endpoints_ativos: 18, total_pedidos: 150, pedidos_por_status: [], requests_por_hora: [] },
      },
      {
        method: 'GET', path: '/api/v1/metricas/api', description: 'Breakdown por endpoint: volume, latência (avg/P95), taxa de erros.', auth: true, profiles: ['GESTOR_CARTOGRAFICO'],
        queryParams: [{ name: 'horas', type: 'int', desc: 'Janela temporal em horas (1–720, padrão 24)' }],
        response: [{ endpoint: '/api/v1/pedidos/', method: 'GET', total_requests: 800, avg_duration_ms: 32.1, p95_duration_ms: 180, error_count: 5, error_rate: 0.006 }],
      },
      {
        method: 'GET', path: '/api/v1/metricas/pedidos', description: 'KPIs de negócio: pedidos por status, por órgão vinculante, evolução mensal e SLA médio.', auth: true, profiles: ['GESTOR_CARTOGRAFICO'],
        response: { total_pedidos: 150, tempo_medio_tramitacao_horas: 288.5, evolucao_mensal: [], pedidos_por_orgao_vinculante: [] },
      },
    ],
  },
]

// ─── Enums de referência ──────────────────────────────────────────────────────

const ENUMS = [
  { name: 'OrgaoVinculanteEnum', values: ['COTER', 'DECEx', 'COLOG', 'DEC'] },
  { name: 'PerfilEnum', values: ['SOLICITANTE', 'SUPERVISOR', 'CONSOLIDADOR', 'GESTOR_CARTOGRAFICO', 'ANALISTA_CGEO'] },
  { name: 'StatusPedidoEnum', values: ['RASCUNHO', 'AGUARDANDO_SUPERVISOR', 'AGUARDANDO_CONSOLIDADOR', 'DEVOLVIDO', 'AGUARDANDO_CARTOGRAFICO', 'ATRIBUIDO_CGEO', 'APROVADO', 'REPROVADO', 'CANCELADO', 'PRODUZIDO'] },
  { name: 'TipoProdutoEnum', values: ['CARTA_TOPOGRAFICA', 'CARTA_ORTOIMAGEM', 'ORTOIMAGEM', 'MDT', 'MDS', 'CDGV', 'IMPRESSAO'] },
  { name: 'EscalaEnum', values: ['1:25.000', '1:50.000', '1:100.000', '1:250.000'] },
  { name: 'TipoJanelaEnum', values: ['SOLICITANTE', 'CONSOLIDADOR', 'GESTOR_CARTOGRAFICO', 'ANALISTA_CGEO', 'GESTOR_CARTOGRAFICO_FINAL'] },
]

// ─── Componentes ──────────────────────────────────────────────────────────────

const METHOD_STYLE: Record<string, string> = {
  GET: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  POST: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PUT: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
}

function EndpointRow({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors text-left"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500 shrink-0" />}
        <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border w-14 text-center shrink-0 ${METHOD_STYLE[ep.method]}`}>
          {ep.method}
        </span>
        <span className="font-mono text-sm text-zinc-300">{ep.path}</span>
        {ep.auth
          ? <Lock className="h-3 w-3 text-zinc-600 ml-1" />
          : <Globe className="h-3 w-3 text-emerald-600 ml-1" />
        }
        <span className="text-zinc-500 text-sm ml-2 flex-1">{ep.description}</span>
        {ep.profiles && (
          <span className="text-xs text-zinc-600 font-mono shrink-0">
            {ep.profiles.slice(0, 2).join(', ')}{ep.profiles.length > 2 ? '…' : ''}
          </span>
        )}
      </button>
      {open && (
        <div className="px-14 pb-4 space-y-3 text-sm">
          {ep.auth && ep.profiles && (
            <div>
              <span className="text-zinc-500 text-xs uppercase tracking-wide">Perfis autorizados</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {ep.profiles.map(p => (
                  <span key={p} className="px-2 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-mono">{p}</span>
                ))}
              </div>
            </div>
          )}
          {ep.queryParams && (
            <div>
              <span className="text-zinc-500 text-xs uppercase tracking-wide">Query params</span>
              <div className="mt-1 space-y-1">
                {ep.queryParams.map(q => (
                  <div key={q.name} className="flex items-baseline gap-2">
                    <code className="text-amber-400 text-xs">{q.name}</code>
                    <span className="text-zinc-600 text-xs">({q.type})</span>
                    <span className="text-zinc-400 text-xs">{q.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {ep.body != null && (
            <div>
              <span className="text-zinc-500 text-xs uppercase tracking-wide">Request body</span>
              <pre className="mt-1 text-xs bg-zinc-950 rounded-lg p-3 border border-white/10 text-zinc-300 overflow-x-auto">
                {JSON.stringify(ep.body as object, null, 2)}
              </pre>
            </div>
          )}
          {ep.response != null && (
            <div>
              <span className="text-zinc-500 text-xs uppercase tracking-wide">Response exemplo</span>
              <pre className="mt-1 text-xs bg-zinc-950 rounded-lg p-3 border border-white/10 text-zinc-300 overflow-x-auto">
                {JSON.stringify(ep.response as object, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function GroupSection({ group }: { group: ApiGroup }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors border-b border-white/10"
      >
        <div className="text-left">
          <h2 className="text-sm font-semibold text-zinc-100">{group.name}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{group.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-600">{group.endpoints.length} endpoints</span>
          {open ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
        </div>
      </button>
      {open && (
        <div>
          {group.endpoints.map((ep, i) => (
            <EndpointRow key={i} ep={ep} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function Integracoes() {
  const [search, setSearch] = useState('')
  const totalEndpoints = API_GROUPS.reduce((s, g) => s + g.endpoints.length, 0)

  const filtered = search.trim()
    ? API_GROUPS.map(g => ({
        ...g,
        endpoints: g.endpoints.filter(
          ep => ep.path.toLowerCase().includes(search.toLowerCase()) ||
                ep.description.toLowerCase().includes(search.toLowerCase()) ||
                ep.method.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(g => g.endpoints.length > 0)
    : API_GROUPS

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Referência de Integração</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {totalEndpoints} endpoints · Base URL: <code className="text-emerald-400 text-xs">/api/v1</code>
          </p>
        </div>
        <a
          href="/api/docs"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-zinc-800 border border-white/10 text-zinc-300 hover:text-zinc-100 hover:border-emerald-500/30 transition-colors"
        >
          Swagger UI <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Autenticação */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
        <p className="text-emerald-300 font-medium mb-1">🔑 Autenticação JWT</p>
        <p className="text-zinc-400">
          Inclua o cabeçalho <code className="text-zinc-200 bg-zinc-800 px-1 rounded">Authorization: Bearer &lt;access_token&gt;</code> em todas as requisições protegidas.
          O token é obtido via <code className="text-zinc-200 bg-zinc-800 px-1 rounded">POST /api/v1/auth/login</code> e tem validade de 8 horas.
        </p>
        <p className="text-zinc-500 text-xs mt-1.5">
          Ícone <Lock className="h-3 w-3 inline" /> = requer token · <Globe className="h-3 w-3 inline text-emerald-600" /> = endpoint público
        </p>
      </div>

      {/* Busca */}
      <input
        type="text"
        placeholder="Filtrar por path, método ou descrição…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
      />

      {/* Grupos de endpoints */}
      {filtered.map(g => <GroupSection key={g.id} group={g} />)}

      {/* Enums de referência */}
      {!search && (
        <div className="rounded-xl border border-white/10 bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold text-zinc-200 mb-4">📖 Enums de referência</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ENUMS.map(e => (
              <div key={e.name}>
                <p className="text-xs font-mono text-amber-400 mb-1.5">{e.name}</p>
                <div className="flex flex-wrap gap-1">
                  {e.values.map(v => (
                    <span key={v} className="text-xs font-mono px-1.5 py-0.5 rounded bg-zinc-800 border border-white/10 text-zinc-400">{v}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
