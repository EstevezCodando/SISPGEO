import api from './client'

export interface MinhaJanela {
  aberta: boolean
  data_inicio: string | null
  data_fim: string | null
  tipo_janela: string | null
  dias_restantes: number | null
  configurada: boolean
}

export interface JanelaOut {
  id: number
  tipo_janela: string
  data_inicio: string
  data_fim: string
  ano_referencia: number
}

export const janelasApi = {
  minhaJanela: () => api.get<MinhaJanela>('/janelas/minha-janela'),
  list: () => api.get<JanelaOut[]>('/janelas/'),
  create: (data: { tipo_janela: string; data_inicio: string; data_fim: string; ano_referencia: number }) =>
    api.post<JanelaOut>('/janelas/', data),
  update: (id: number, data: { data_inicio: string; data_fim: string }) =>
    api.put<JanelaOut>(`/janelas/${id}`, data),
  delete: (id: number) => api.delete(`/janelas/${id}`),
}
