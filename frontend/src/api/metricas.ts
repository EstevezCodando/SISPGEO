import api from './client'

export interface EndpointMetrica {
  endpoint: string
  method: string
  total_requests: number
  avg_duration_ms: number
  max_duration_ms: number
  p95_duration_ms: number
  error_count: number
  error_rate: number
  last_called: string | null
}

export interface HoraMetrica {
  hora: string
  total: number
  erros: number
}

export interface StatusCount {
  status: string
  count: number
}

export interface OrgaoVinculanteCount {
  orgao_vinculante: string
  count: number
}

export interface MesCount {
  mes: string
  count: number
}

export interface ResumoMetricas {
  total_requests_24h: number
  avg_response_ms: number
  error_rate_24h: number
  endpoints_ativos: number
  total_pedidos: number
  pedidos_por_status: StatusCount[]
  pedidos_por_orgao_vinculante: OrgaoVinculanteCount[]
  requests_por_hora: HoraMetrica[]
}

export interface PedidosMetricas {
  total_pedidos: number
  pedidos_por_status: StatusCount[]
  pedidos_por_orgao_vinculante: OrgaoVinculanteCount[]
  evolucao_mensal: MesCount[]
  tempo_medio_tramitacao_horas: number | null
}

export interface PedidoHistoricoItem {
  id: number
  pedido_id: number
  status_anterior: string | null
  status_novo: string
  usuario_id: number | null
  usuario_nome: string | null
  acao: string
  motivo: string | null
  criado_em: string
}

export const metricasApi = {
  resumo: () => api.get<ResumoMetricas>('/metricas/resumo'),
  api: (horas = 24) => api.get<EndpointMetrica[]>(`/metricas/api?horas=${horas}`),
  pedidos: () => api.get<PedidosMetricas>('/metricas/pedidos'),
  historicoPedido: (id: number) =>
    api.get<PedidoHistoricoItem[]>(`/pedidos/${id}/historico`),
  historicoGlobal: (limit = 100, offset = 0) =>
    api.get<PedidoHistoricoItem[]>(`/historico?limit=${limit}&offset=${offset}`),
}
