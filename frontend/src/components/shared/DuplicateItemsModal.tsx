import { AlertTriangle, Copy, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DuplicateItem } from '../../api/pedidos'
import { TIPO_PRODUTO_LABELS } from '../../types/pedido'
import { StatusBadge } from './StatusBadge'

interface DuplicateItemsModalProps {
  duplicates: DuplicateItem[]
  title?: string
  message?: string
  footer?: ReactNode
  onClose: () => void
}

export function DuplicateItemsModal({
  duplicates,
  title = 'Produtos duplicados',
  message = 'Itens com mesma articulacao, produto e escala em pedidos diferentes.',
  footer,
  onClose,
}: DuplicateItemsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center gap-3 p-6 border-b border-white/10">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{message}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-zinc-500 hover:text-zinc-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-3 max-h-72 overflow-y-auto">
          {duplicates.length === 0 ? (
            <div className="text-sm text-zinc-400">Nenhuma duplicata encontrada.</div>
          ) : duplicates.map((dup, idx) => (
            <div key={`${dup.inom}-${dup.tipo_produto}-${dup.escala}-${idx}`} className="bg-zinc-800/60 border border-zinc-700/40 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Copy className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="text-xs font-medium text-zinc-200">
                  <span className="text-emerald-400 font-mono">{dup.inom}</span>
                  <span className="text-zinc-500 mx-1">-</span>
                  {TIPO_PRODUTO_LABELS[dup.tipo_produto as keyof typeof TIPO_PRODUTO_LABELS] ?? dup.tipo_produto}
                  <span className="text-zinc-500 mx-1">-</span>
                  {dup.escala}
                </span>
              </div>
              <div className="space-y-1">
                {dup.pedidos.map((p) => {
                  const id = p.id ?? p.pedido_id
                  return (
                    <div key={id} className="flex items-center gap-2 text-xs text-zinc-400 pl-5">
                      <span className="text-emerald-400 font-semibold">#{id}</span>
                      <span>{p.usuario_nome ?? '-'}</span>
                      <StatusBadge status={p.status as Parameters<typeof StatusBadge>[0]['status']} />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {footer && <div className="p-6 pt-0">{footer}</div>}
      </div>
    </div>
  )
}
