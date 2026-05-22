export type Perfil =
  | 'SOLICITANTE'
  // Supervisores regionais (um por CMilA)
  | 'SUPERVISOR_CMP'
  | 'SUPERVISOR_CML'
  | 'SUPERVISOR_CMS'
  | 'SUPERVISOR_CMO'
  | 'SUPERVISOR_CMAO'
  | 'SUPERVISOR_CMA'
  | 'SUPERVISOR_CMNE'
  | 'SUPERVISOR_CMSE'
  // Consolidadores por órgão
  | 'CONSOLIDADOR_COTER'
  | 'CONSOLIDADOR_DSG'
  | 'CONSOLIDADOR_DEC'
  | 'CONSOLIDADOR_COLOG'
  | 'CONSOLIDADOR_DECEX'
  | 'GESTOR_CARTOGRAFICO'
  | 'ANALISTA_CGEO'
  // Legados (mantidos para compatibilidade)
  | 'SUPERVISOR'
  | 'CONSOLIDADOR'

export const SUPERVISOR_PROFILES = new Set<Perfil>([
  'SUPERVISOR_CMP', 'SUPERVISOR_CML', 'SUPERVISOR_CMS', 'SUPERVISOR_CMO',
  'SUPERVISOR_CMAO', 'SUPERVISOR_CMA', 'SUPERVISOR_CMNE', 'SUPERVISOR_CMSE',
  'SUPERVISOR',
])

export const CONSOLIDADOR_PROFILES = new Set<Perfil>([
  'CONSOLIDADOR_COTER', 'CONSOLIDADOR_DSG', 'CONSOLIDADOR_DEC',
  'CONSOLIDADOR_COLOG', 'CONSOLIDADOR_DECEX',
  'CONSOLIDADOR',
])

export const PERFIL_LABELS: Record<Perfil, string> = {
  SOLICITANTE:         'OMDS — Solicitante',
  SUPERVISOR_CMP:      'Supervisor — C Mil Planalto',
  SUPERVISOR_CML:      'Supervisor — C Mil Leste',
  SUPERVISOR_CMS:      'Supervisor — C Mil Sul',
  SUPERVISOR_CMO:      'Supervisor — C Mil Oeste',
  SUPERVISOR_CMAO:     'Supervisor — C Mil Amazônia Ocidental',
  SUPERVISOR_CMA:      'Supervisor — C Mil Amazônia',
  SUPERVISOR_CMNE:    'Supervisor — C Mil Nordeste',
  SUPERVISOR_CMSE:     'Supervisor — C Mil Sudeste',
  CONSOLIDADOR_COTER:  'Consolidador — COTER',
  CONSOLIDADOR_DSG:    'Consolidador — DSG',
  CONSOLIDADOR_DEC:    'Consolidador — DEC',
  CONSOLIDADOR_COLOG:  'Consolidador — COLOG',
  CONSOLIDADOR_DECEX:  'Consolidador — DECEx',
  GESTOR_CARTOGRAFICO: 'Gestor Cartográfico (DSG)',
  ANALISTA_CGEO:       'Analista CGEO',
  SUPERVISOR:          'Supervisor (legado)',
  CONSOLIDADOR:        'Consolidador (legado)',
}

// OrgaoVinculante sem DCT (mantido no banco mas não exibido no cadastro)
export type OrgaoVinculante = 'COTER' | 'DSG' | 'DECEx' | 'COLOG' | 'DEC'

export interface Usuario {
  id: number
  nome: string
  email: string
  telefone: string | null
  telefone_ritex: string | null
  secao_om: string | null
  om: string
  regiao_militar: string | null
  posto_graduacao: string | null
  perfil: Perfil
  orgao_vinculante: OrgaoVinculante | null
  cgeo_id: number | null
  ativo: boolean
  email_confirmado: boolean
  ultima_senha_alterada: string | null
  ultima_confirmacao_dados: string | null
  pedidos_transferidos_em: string | null
  tentativas_login: number
  bloqueado_ate: string | null
  criado_em: string
  atualizado_em: string
}

export interface Notificacao {
  id: number
  titulo: string
  mensagem: string
  lida: boolean
  pedido_id: number | null
  criado_em: string
}
