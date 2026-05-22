import api from './client'
import type { Usuario, Notificacao } from '../types/user'

export interface Transferencia {
  id: number
  pedido_id: number
  de_usuario_id: number | null
  de_usuario_nome: string | null
  para_usuario_id: number | null
  para_usuario_nome: string | null
  executor_id: number | null
  executor_nome: string | null
  observacao: string | null
  transferido_em: string
}

export const usersApi = {
  getMe: () => api.get<Usuario>('/users/me'),
  updateMe: (data: {
    telefone?: string
    secao_om?: string
    om?: string
    regiao_militar?: string
    posto_graduacao?: string
  }) => api.put<Usuario>('/users/me', data),
  changePassword: (senha_atual: string, nova_senha: string) =>
    api.put('/users/me/password', { senha_atual, nova_senha }),
  confirmData: () => api.post('/users/me/confirm-data'),
  getUnreadCount: () => api.get<{ unread: number }>('/users/me/notifications/unread-count'),
  getNotifications: () => api.get<Notificacao[]>('/users/me/notifications'),
  markNotificationRead: (id: number) => api.put(`/users/me/notifications/${id}/read`),
  listUsers: () => api.get<Usuario[]>('/users/'),
  listMesmaOM: () => api.get<Usuario[]>('/users/mesma-om'),
  updateProfile: (userId: number, perfil: string, orgao_vinculante?: string, cgeo_id?: number) =>
    api.put(`/users/${userId}/profile`, { perfil, orgao_vinculante, cgeo_id }),
  toggleActivate: (userId: number) => api.put(`/users/${userId}/activate`),
  transferirPedidos: (userId: number, novo_responsavel_id: number) =>
    api.post<{ transferidos: number; novo_responsavel: string }>(
      `/users/${userId}/transferir-pedidos`,
      { novo_responsavel_id },
    ),
  getMinhasTransferencias: () => api.get<Transferencia[]>('/transferencias/minhas'),
  getUsuarioTransferencias: (userId: number) =>
    api.get<Transferencia[]>(`/transferencias/usuario/${userId}`),
}
