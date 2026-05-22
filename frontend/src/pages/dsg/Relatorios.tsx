import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { pedidosApi } from '../../api/pedidos'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { StatusBadge } from '../../components/shared/StatusBadge'
import type { Pedido } from '../../types/pedido'
import { STATUS_LABELS, TIPO_PRODUTO_LABELS } from '../../types/pedido'

export function Relatorios() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    pedidosApi.list()
      .then((r) => setPedidos(r.data))
      .catch(() => toast.error('Erro ao carregar dados'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner />

  const byStatus = pedidos.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const byType = pedidos.flatMap((p) => p.itens).reduce((acc, i) => {
    acc[i.tipo_produto] = (acc[i.tipo_produto] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div>
      <h1 className="text-xl font-semibold text-zinc-100 tracking-tight mb-6">Relatórios</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-5">
          <h2 className="font-medium text-zinc-200 mb-4">Pedidos por Status</h2>
          <div className="space-y-2">
            {Object.entries(byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <StatusBadge status={status as any} />
                <span className="font-semibold text-zinc-200">{count}</span>
              </div>
            ))}
            {Object.keys(byStatus).length === 0 && (
              <p className="text-zinc-500 text-sm">Nenhum dado disponível.</p>
            )}
          </div>
        </div>

        <div className="bg-zinc-900 border border-white/10 rounded-xl p-5">
          <h2 className="font-medium text-zinc-200 mb-4">Produtos Mais Solicitados</h2>
          <div className="space-y-2">
            {Object.entries(byType)
              .sort((a, b) => b[1] - a[1])
              .map(([tipo, count]) => (
                <div key={tipo} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{TIPO_PRODUTO_LABELS[tipo as keyof typeof TIPO_PRODUTO_LABELS] ?? tipo}</span>
                  <span className="font-semibold text-zinc-200 bg-zinc-800 px-2 py-0.5 rounded">{count}</span>
                </div>
              ))}
            {Object.keys(byType).length === 0 && (
              <p className="text-zinc-500 text-sm">Nenhum dado disponível.</p>
            )}
          </div>
        </div>

        <div className="bg-zinc-900 border border-white/10 rounded-xl p-5 md:col-span-2">
          <h2 className="font-medium text-zinc-200 mb-2">Total de Pedidos</h2>
          <p className="text-4xl font-bold text-emerald-400">{pedidos.length}</p>
        </div>
      </div>
    </div>
  )
}
