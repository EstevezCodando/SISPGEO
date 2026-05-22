import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Map, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { pedidosApi } from '../../api/pedidos'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { PedidosMap } from '../../components/map/PedidosMap'
import type { Pedido } from '../../types/pedido'
import { TIPO_PRODUTO_LABELS } from '../../types/pedido'

// ─── Expanded Row ──────────────────────────────────────────────────────────────
function ExpandedDetails({ pedido: p }: { pedido: Pedido }) {
  return (
    <tr className="bg-zinc-800/30">
      <td colSpan={6} className="px-6 py-4">
        <div className="space-y-3">
          {p.finalidade && (
            <p className="text-xs text-zinc-400">
              <span className="font-medium text-zinc-300">Finalidade:</span> {p.finalidade}
            </p>
          )}
          {p.motivo_reprovacao && (
            <p className="text-xs text-red-400">
              <span className="font-medium">Motivo:</span> {p.motivo_reprovacao}
            </p>
          )}
          {p.observacoes && (
            <p className="text-xs text-zinc-400">
              <span className="font-medium text-zinc-300">Observações:</span> {p.observacoes}
            </p>
          )}
          <div>
            <p className="text-xs font-medium text-zinc-500 mb-1.5">Itens</p>
            <div className="space-y-1">
              {[...p.itens].sort((a, b) => a.prioridade - b.prioridade).map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="text-zinc-600 w-4 text-center shrink-0">{idx + 1}</span>
                  <span className="text-emerald-400 font-mono shrink-0">{item.inom}</span>
                  {item.mi && <span className="text-zinc-500 font-mono shrink-0">MI: {item.mi}</span>}
                  <span className="shrink-0">{TIPO_PRODUTO_LABELS[item.tipo_produto]}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="shrink-0">{item.escala}</span>
                </div>
              ))}
            </div>
          </div>
          {p.link_bdgex && (
            <a
              href={p.link_bdgex}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              🔗 Ver no BDGEx
            </a>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function PedidosHomologados() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [showMap, setShowMap] = useState(false)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  useEffect(() => {
    pedidosApi.listHomologados()
      .then(r => setPedidos(r.data))
      .catch(() => toast.error('Erro ao carregar pedidos homologados'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Pedidos Homologados</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Pedidos já encaminhados ao próximo escalão · {pedidos.length} registro(s)
          </p>
        </div>
        <button
          onClick={() => setShowMap(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            showMap
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
          }`}
        >
          <Map className="h-4 w-4" />
          {showMap ? 'Fechar mapa' : 'Ver no mapa'}
        </button>
      </div>

      {/* Map */}
      {showMap && (
        <div
          className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden"
          style={{ height: '380px' }}
        >
          <PedidosMap className="w-full h-full" />
        </div>
      )}

      {/* Table */}
      {pedidos.length === 0 ? (
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-12 text-center">
          <CheckCircle className="h-10 w-10 text-emerald-500/40 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Nenhum pedido homologado encontrado.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="border-b border-white/10 bg-zinc-800/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400 w-20">Pedido</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Solicitante</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Produtos</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Entrega</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Status</th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pedidos.map(p => {
                  const tipos = [...new Set(p.itens.map(i => TIPO_PRODUTO_LABELS[i.tipo_produto]))].join(', ')
                  const dataFmt = p.data_entrega
                    ? format(new Date(p.data_entrega + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })
                    : '—'
                  const isExpanded = expandedRow === p.id

                  return (
                    <React.Fragment key={p.id}>
                      <tr
                        className={`transition-colors ${isExpanded ? 'bg-zinc-800/30' : 'hover:bg-white/5'}`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-emerald-400 text-sm">#{p.id}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-zinc-200 font-medium text-sm leading-tight">{p.usuario_nome ?? '—'}</p>
                          {p.usuario_om && (
                            <p className="text-[10px] text-zinc-500 mt-0.5">{p.usuario_om}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-zinc-300">{tipos}</p>
                          <p className="text-[10px] text-zinc-500">{p.itens.length} item(ns)</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-400">{dataFmt}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setExpandedRow(isExpanded ? null : p.id)}
                            className={`p-1.5 rounded-md transition-colors ${
                              isExpanded
                                ? 'bg-zinc-700 text-zinc-200'
                                : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                            }`}
                            title={isExpanded ? 'Fechar detalhes' : 'Ver detalhes'}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && <ExpandedDetails pedido={p} />}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
