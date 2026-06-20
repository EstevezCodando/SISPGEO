import { useState } from 'react'
import { Clock, XCircle } from 'lucide-react'
import { format, isBefore, isAfter } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuthStore } from '../../store/authStore'
import { ProrrogacaoModal } from '../janelas/ProrrogacaoModal'
import { useDeadlineWindow } from '../../hooks/useDeadlineWindow'

/**
 * Qual tipo_janela é relevante para cada perfil.
 * Perfis sem entrada não recebem banner.
 */
const PERFIL_JANELA: Record<string, string> = {
  SOLICITANTE:         'SOLICITANTE',
  SUPERVISOR:          'CONSOLIDADOR',
  CONSOLIDADOR:        'GESTOR_CARTOGRAFICO',
  GESTOR_CARTOGRAFICO: 'ANALISTA_CGEO',
}
// ANALISTA_CGEO e GESTOR_CARTOGRAFICO_FINAL não têm banner de prazo

/** Label do prazo conforme perfil */
const PERFIL_PRAZO_LABEL: Record<string, string> = {
  SOLICITANTE:         'Prazo para submissão de pedidos',
  SUPERVISOR:          'Prazo para encaminhamento ao Consolidador (COTER)',
  CONSOLIDADOR:        'Prazo para encaminhamento ao Gestor Cartográfico (DSG)',
  GESTOR_CARTOGRAFICO: 'Prazo para recebimento e distribuição às CGEOs',
}

// ----- Banner principal -----
export function DeadlineBanner() {
  const { user } = useAuthStore()
  const { janelas } = useDeadlineWindow()
  const [showModal, setShowModal] = useState(false)

  if (!user) return null

  const tipoJanela = PERFIL_JANELA[user.perfil]
  if (!tipoJanela) return null   // CGEO e DSG_FINAL não veem banner

  const now = new Date()

  // Janelas deste perfil, ordenadas por data de início descrescente (mais recente primeiro)
  const candidates = janelas
    .filter((j) => j.tipo_janela === tipoJanela)
    .sort((a, b) => new Date(b.data_inicio).getTime() - new Date(a.data_inicio).getTime())

  if (candidates.length === 0) return null  // nenhuma janela cadastrada → sem banner

  // Janela ativa: data_inicio <= now <= data_fim
  const active = candidates.find(
    (j) => !isBefore(now, new Date(j.data_inicio)) && !isAfter(now, new Date(j.data_fim))
  )

  // Janela encerrada mais recente (apenas se não houver ativa e não houver futura)
  const hasUpcoming = candidates.some((j) => isAfter(new Date(j.data_inicio), now))
  const expired = !active && !hasUpcoming
    ? candidates.find((j) => isAfter(now, new Date(j.data_fim)))
    : undefined

  // Janela futura → não mostrar banner (prazo não abriu ainda)
  if (!active && !expired) return null

  const prazoLabel = PERFIL_PRAZO_LABEL[user.perfil] ?? 'Prazo de pedidos'

  // ── Banner: prazo ABERTO ──
  if (active) {
    const dataFim = new Date(active.data_fim)
    const diffMs = dataFim.getTime() - now.getTime()
    const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    const urgente = diasRestantes <= 7

    return (
      <div className={`shrink-0 border-b flex items-center gap-2 px-4 py-1.5 text-xs ${
        urgente
          ? 'bg-red-500/10 border-red-500/20 text-red-300'
          : 'bg-emerald-500/8 border-emerald-500/15 text-emerald-300'
      }`}>
        <Clock className={`h-3.5 w-3.5 shrink-0 ${urgente ? 'text-red-400' : 'text-emerald-400'}`} />
        <span className="font-medium">{prazoLabel} aberto —</span>
        <span className={`font-bold ${urgente ? 'text-red-100' : 'text-emerald-100'}`}>
          encerra em {format(dataFim, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </span>
        {urgente && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500/20 border border-red-500/30 text-red-300">
            {diasRestantes <= 0 ? 'encerra hoje' : `${diasRestantes} dia${diasRestantes !== 1 ? 's' : ''}`}
          </span>
        )}
      </div>
    )
  }

  // ── Banner: prazo ENCERRADO ──
  return (
    <>
      <div className="shrink-0 border-b border-zinc-700/60 bg-zinc-800/40 flex items-center gap-2 px-4 py-1.5 text-xs text-zinc-400">
        <XCircle className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span>{prazoLabel} encerrado em</span>
        <span className="font-medium text-zinc-300">
          {format(new Date(expired!.data_fim), "dd/MM/yyyy", { locale: ptBR })}
        </span>
        <span className="mx-1 text-zinc-600">·</span>
        <button
          onClick={() => setShowModal(true)}
          className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors underline underline-offset-2"
        >
          Solicitar prorrogação ao escalão superior
        </button>
      </div>

      {showModal && (
        <ProrrogacaoModal
          onClose={() => setShowModal(false)}
          dataEncerramento={expired!.data_fim}
        />
      )}
    </>
  )
}
