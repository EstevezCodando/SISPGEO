import type { StatusPedido } from '../../types/pedido'
import { STATUS_LABELS, STATUS_COLORS } from '../../types/pedido'

export function StatusBadge({ status }: { status: StatusPedido }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}
