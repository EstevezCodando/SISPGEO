import api from './client'
import type { Pedido } from '../types/pedido'

export interface DuplicateItem {
  inom: string
  mi: string | null
  tipo_produto: string
  escala: string
  pedidos: Array<{ id: number; pedido_id?: number; usuario_nome: string | null; status: string }>
}

export interface BDGExAgeItem {
  inom: string
  mi: string | null
  tipo_produto: string
  escala: string
  data_producao_bdgex: string   // ISO date string
  idade_anos: number
  pedidos: Array<{ pedido_id: number; usuario_nome: string; status: string; om: string | null }>
}

export interface ExportRequest {
  pedido_ids?: number[]
  status_filter?: string[]
}

export interface AdminUpdatePayload {
  status?: string
  data_entrega?: string
  finalidade?: string
  observacoes?: string
  cgeo_id?: number
  prioridade?: number
  link_bdgex?: string
  motivo_reprovacao?: string
  orgao_vinculante?: string
}

export interface RelatorioAnalitico {
  filtro: {
    cgeo_id: number | null
    cgeo_label: string
    escopo: 'todos' | 'dsg'
    escopo_label: string
    status: string[]
  }
  totais: {
    pedidos: number
    itens: number
  }
  por_asc: Array<{
    cgeo_id: number | null
    label: string
    pedidos: number
    itens: number
  }>
  por_status: Array<{ status: string; total: number }>
  por_tipo: Array<{ tipo_produto: string; total: number }>
  por_escala: Array<{ escala: string; total: number }>
  por_tipo_escala: Array<{ tipo_produto: string; escala: string; total: number }>
  produtos_mais_pedidos: Array<{
    inom: string
    mi: string | null
    tipo_produto: string
    escala: string
    total: number
  }>
}

export const pedidosApi = {
  create: (data: object) => api.post<Pedido>('/pedidos/', data),
  list: () => api.get<Pedido[]>('/pedidos/'),
  listPending: () => api.get<Pedido[]>('/pedidos/pending'),
  get: (id: number) => api.get<Pedido>(`/pedidos/${id}`),
  submit: (id: number) => api.post<Pedido>(`/pedidos/${id}/submit`),
  review: (id: number, acao: string, motivo?: string, observacoes?: string) =>
    api.put<Pedido>(`/pedidos/${id}/review`, { acao, motivo, observacoes }),
  mapFeatures: () => api.get('/pedidos/map-features'),
  adminAll: (params?: { status?: string; orgao_vinculante?: string; q?: string }) =>
    api.get<Pedido[]>('/pedidos/admin/all', { params }),
  adminDelete: (id: number) => api.delete(`/pedidos/admin/${id}`),
  adminUpdate: (id: number, data: Partial<AdminUpdatePayload>) =>
    api.put<Pedido>(`/pedidos/admin/${id}`, data),
  // ZIP completo: GeoJSONs por escala + CSV + relatório TXT (DSG/Admin)
  exportGeoJSON: (body: ExportRequest) =>
    api.post('/pedidos/admin/export', body, { responseType: 'blob' }),
  consolidate: (pedido_ids: number[]) => api.post('/pedidos/consolidate', { pedido_ids }),
  assignCGEO: (id: number, cgeo_id: number) =>
    api.put<Pedido>(`/pedidos/${id}/assign-cgeo`, { cgeo_id }),
  cgeoReview: (id: number, acao: string, motivo?: string, link_bdgex?: string) =>
    api.put<Pedido>(`/pedidos/${id}/cgeo-review`, { acao, motivo, link_bdgex }),
  listCgeoAtendimento: () => api.get<Pedido[]>('/pedidos/cgeo-atendimento'),
  cancel: (id: number) => api.delete(`/pedidos/${id}`),
  update: (id: number, data: object) => api.put<Pedido>(`/pedidos/${id}`, data),
  features: (id: number) => api.get(`/pedidos/${id}/features`),
  solicitarRemocao: (id: number, justificativa: string) =>
    api.post(`/pedidos/${id}/solicitar-remocao`, { justificativa }),
  // Priority reordering
  reorderPedidos: (ordered_ids: number[]) =>
    api.put('/pedidos/reorder', { ordered_ids }),
  reorderItems: (pedidoId: number, ordered_ids: number[]) =>
    api.put(`/pedidos/${pedidoId}/items/reorder`, { ordered_ids }),
  // Duplicates
  getDuplicatas: (params?: { todos?: boolean }) => api.get<DuplicateItem[]>('/pedidos/duplicatas', { params }),
  // BDGEx age validator — products newer than N years
  getProdutosRecentes: (anos: number) =>
    api.get<BDGExAgeItem[]>('/pedidos/admin/produtos-recentes', { params: { anos } }),
  // Relatório: ZIP com CSV + GeoJSONs por escala + LEIA-ME (SOLICITANTE / SUPERVISOR / CONSOLIDADOR)
  exportRelatorio: () => api.get('/pedidos/relatorio', { responseType: 'blob' }),
  relatorioAnalitico: (params?: { cgeo_id?: number; escopo?: 'todos' | 'dsg' }) =>
    api.get<RelatorioAnalitico>('/pedidos/relatorio-analitico', { params }),
  // Export (DSG) — legacy ZIP export
  exportZip: () => api.get('/pedidos/export', { responseType: 'blob' }),
  // Dar o Pronto — DSG/Admin marks pedido as PRODUZIDO and notifies chain
  darPronto: (id: number, observacoes: string, link_bdgex?: string) =>
    api.post<Pedido>(`/pedidos/${id}/dar-pronto`, { observacoes, link_bdgex }),
  // Remove single item/cell from an editable pedido
  deleteItem: (pedidoId: number, itemId: number) =>
    api.delete(`/pedidos/${pedidoId}/items/${itemId}`),
  // Pedidos já encaminhados além da fila atual (SUPERVISOR/CONSOLIDADOR)
  listHomologados: () => api.get<Pedido[]>('/pedidos/homologados'),
  // Submete pedidos RASCUNHO do usuário em lote; pedido_ids=undefined → todos
  enviarLote: (auto_submitted = false, pedido_ids?: number[]) =>
    api.post<import('../types/pedido').Pedido[]>('/pedidos/enviar-lote', { auto_submitted, pedido_ids }),
}
