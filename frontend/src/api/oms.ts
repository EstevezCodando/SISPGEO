import api from './client'

export const omsApi = {
  /** Lista OMs customizadas para um comando de área (ex: "CMP") */
  listar: (cmila: string) =>
    api.get<string[]>(`/oms/${cmila}`),

  /** Salva nova OM customizada (ignora duplicatas silenciosamente) */
  criar: (cmila: string, nome: string) =>
    api.post<{ created: boolean; nome: string }>('/oms', { cmila, nome }),
}
