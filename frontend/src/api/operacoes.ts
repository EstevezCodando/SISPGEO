import api from './client'

export interface Operacao {
  id: number
  nome: string
  om: string
}

export const operacoesApi = {
  list: () => api.get<Operacao[]>('/operacoes/'),
  create: (nome: string) => api.post<Operacao>('/operacoes/', { nome }),
}
