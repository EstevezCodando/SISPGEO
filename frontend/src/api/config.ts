import api from './client'

export interface ConfigEntrega {
  data_base: string                      // "YYYY-MM-DD"
  prazos_minimos: Record<string, number> // produto → dias
  datas_minimas: Record<string, string>  // produto → "YYYY-MM-DD" (data_base + prazo)
  atualizado_em: string | null
}

export const configApi = {
  getAno: () => api.get<{ ano: number }>('/config/ano'),
  getEntrega: () => api.get<ConfigEntrega>('/config/entrega'),
  updateEntrega: (data_base: string) =>
    api.put<ConfigEntrega>('/config/entrega', { data_base }),
}
