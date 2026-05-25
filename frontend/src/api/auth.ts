import api from './client'

export interface RegisterPayload {
  nome: string
  nome_de_guerra?: string
  email: string
  telefone: string
  telefone_ritex?: string   // NNN-NNNN (Ritex)
  regiao_militar?: string
  om: string
  secao_om: string
  senha: string
  orgao_vinculante?: string
  posto_graduacao?: string
}

export const authApi = {
  register: (data: RegisterPayload) => api.post('/auth/register', data),
  login: (email: string, senha: string) =>
    api.post<{ access_token: string }>('/auth/login', { email, senha }),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, nova_senha: string) =>
    api.post('/auth/reset-password', { token, nova_senha }),
  confirmEmail: (token: string) => api.get(`/auth/confirm-email/${token}`),
}
