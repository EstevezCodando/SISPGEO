import { useEffect, useState } from 'react'
import api from '../api/client'

export interface JanelaDeadline {
  id: number
  tipo_janela: string
  data_inicio: string
  data_fim: string
  ano_referencia: number
}

/**
 * Busca a lista de janelas de prazo do backend.
 * A filtragem por tipo/perfil e o cálculo de ativa/expirada ficam no componente,
 * pois dependem do perfil do usuário logado.
 */
export function useDeadlineWindow() {
  const [janelas, setJanelas] = useState<JanelaDeadline[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api
      .get<JanelaDeadline[]>('/janelas/')
      .then((r) => setJanelas(r.data))
      .catch(() => setError('Erro ao carregar janelas de prazo'))
      .finally(() => setLoading(false))
  }, [])

  return { janelas, loading, error }
}
