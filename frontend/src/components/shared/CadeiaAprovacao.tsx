import { CheckCircle2, Circle, ArrowRight } from 'lucide-react'
import type { StatusPedido } from '../../types/pedido'
import { STATUS_PROGRESSION } from '../../types/pedido'

// Ordenação do caminho feliz — fonte única em types/pedido.ts
const STATUS_ORDER = STATUS_PROGRESSION

function statusIndex(status: string): number {
  const idx = STATUS_ORDER.indexOf(status as StatusPedido)
  return idx === -1 ? 0 : idx
}

interface Props {
  cadeia: string[]
  status: string
}

/**
 * Exibe a cadeia de aprovação de um pedido como uma linha de etapas.
 * As etapas concluídas aparecem com check verde; a etapa atual em destaque;
 * as futuras em cinza.
 */
export function CadeiaAprovacao({ cadeia, status }: Props) {
  if (!cadeia || cadeia.length === 0) return null

  // Mapeamento etapa → status que indica que ela foi "passada"
  const etapaStatusMap: Record<string, string[]> = {
    Solicitante: ['AGUARDANDO_SUPERVISOR', 'AGUARDANDO_CONSOLIDADOR', 'AGUARDANDO_CARTOGRAFICO', 'ATRIBUIDO_CGEO', 'APROVADO', 'PRODUZIDO'],
  }
  cadeia.forEach((etapa, i) => {
    if (i > 0 && i < cadeia.length - 1) {
      etapaStatusMap[etapa] = STATUS_ORDER.slice(statusIndex(STATUS_ORDER[i + 1]))
    }
  })

  const currentIdx = statusIndex(status)

  // Determina o índice da etapa "ativa" na cadeia baseado no status atual
  const etapaAtualIdx = (() => {
    if (status === 'RASCUNHO') return 0
    if (status === 'AGUARDANDO_SUPERVISOR') return 1
    if (status === 'AGUARDANDO_CONSOLIDADOR') return cadeia.findIndex(e => e.toLowerCase().includes('consolidador'))
    if (status === 'AGUARDANDO_CARTOGRAFICO') return cadeia.findIndex(e => e.toLowerCase().includes('gestor'))
    if (status === 'ATRIBUIDO_CGEO' || status === 'APROVADO') return cadeia.findIndex(e => e.toLowerCase().includes('cgeo'))
    if (status === 'PRODUZIDO') return cadeia.length - 1
    return 0
  })()

  const concluidas = new Set(cadeia.slice(0, Math.max(0, etapaAtualIdx)).map((_, i) => i))

  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wide">Cadeia de Aprovação</p>
      <div className="flex items-center gap-1 flex-wrap">
        {cadeia.map((etapa, i) => {
          const concluida = concluidas.has(i)
          const ativa = i === etapaAtualIdx
          const futura = !concluida && !ativa

          return (
            <div key={i} className="flex items-center gap-1">
              <div className={[
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                concluida
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : ativa
                  ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                  : 'bg-zinc-800/60 border-zinc-700/40 text-zinc-500',
              ].join(' ')}>
                {concluida
                  ? <CheckCircle2 className="h-3 w-3 shrink-0" />
                  : <Circle className={`h-3 w-3 shrink-0 ${ativa ? 'text-blue-400' : 'text-zinc-600'}`} />
                }
                {etapa}
              </div>
              {i < cadeia.length - 1 && (
                <ArrowRight className="h-3 w-3 text-zinc-600 shrink-0" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
