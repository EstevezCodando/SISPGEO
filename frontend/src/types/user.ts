export type Perfil =
  | 'SOLICITANTE'
  | 'SUPERVISOR'
  | 'CONSOLIDADOR'
  | 'GESTOR_CARTOGRAFICO'
  | 'ANALISTA_CGEO'

export type OrgaoVinculante = 'COTER' | 'DECEx' | 'COLOG' | 'DEC'

export interface Usuario {
  id: number
  nome: string
  email: string
  telefone: string | null
  secao_om: string | null
  om: string
  regiao_militar: string | null
  posto_graduacao: string | null
  perfil: Perfil
  orgao_vinculante: OrgaoVinculante | null
  ativo: boolean
  ultima_confirmacao_dados: string | null
  pedidos_transferidos_em: string | null
  criado_em: string
}

export interface Notificacao {
  id: number
  titulo: string
  mensagem: string
  lida: boolean
  pedido_id: number | null
  criado_em: string
}
