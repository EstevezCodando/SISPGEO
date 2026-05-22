import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PlayCircle, AlertTriangle, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react'
import { pedidosApi } from '../../api/pedidos'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import type { Pedido } from '../../types/pedido'
import { TIPO_PRODUTO_LABELS } from '../../types/pedido'

// ─── Cartão de pedido compartilhado ──────────────────────────────────────────
function PedidoInfo({ p }: { p: Pedido }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <span className="font-bold text-emerald-400">#{p.id}</span>
        <StatusBadge status={p.status} />
        <span className="text-xs text-zinc-500">{p.orgao_vinculante}</span>
        {p.usuario_nome && (
          <span className="text-xs text-zinc-600">· {p.usuario_nome}</span>
        )}
      </div>
      <p className="text-sm text-zinc-300 mb-1">
        <span className="text-zinc-500">Produtos:</span>{' '}
        {[...new Set(p.itens.map((i) => TIPO_PRODUTO_LABELS[i.tipo_produto]))].join(', ')}
        {' '}
        <span className="text-zinc-600">({p.itens.length} folha{p.itens.length !== 1 ? 's' : ''})</span>
      </p>
      <p className="text-sm text-zinc-400">
        <span className="text-zinc-500">Data sol. de entrega:</span>{' '}
        {format(new Date(p.data_entrega + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
      </p>
      {p.operacao_nome && (
        <p className="text-sm text-zinc-400 mt-0.5">
          <span className="text-zinc-500">Operação:</span> {p.operacao_nome}
        </p>
      )}
      {p.finalidade && (
        <p className="text-sm text-zinc-400 mt-0.5">
          <span className="text-zinc-500">Finalidade:</span> {p.finalidade}
        </p>
      )}
      {p.observacoes && (
        <p className="text-xs text-zinc-500 mt-1 italic border-l-2 border-white/10 pl-2">
          Obs. COTER: {p.observacoes}
        </p>
      )}
    </div>
  )
}

// ─── Painel A: Análise de viabilidade (ATRIBUIDO_CGEO) ───────────────────────
function PainelAnalise({
  pedidos,
  onRefresh,
}: {
  pedidos: Pedido[]
  onRefresh: () => void
}) {
  const [motivo, setMotivo] = useState<Record<number, string>>({})
  const [processing, setProcessing] = useState<number | null>(null)

  const handleReview = async (id: number, acao: 'aprovar' | 'reprovar') => {
    if (acao === 'reprovar' && !motivo[id]?.trim()) {
      toast.error('Informe o motivo da inviabilidade antes de registrar')
      return
    }
    setProcessing(id)
    try {
      await pedidosApi.cgeoReview(id, acao, motivo[id])
      toast.success(
        acao === 'aprovar'
          ? 'Pedido aceito para atendimento'
          : 'Inviabilidade registrada e comunicada'
      )
      onRefresh()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao processar pedido')
    } finally {
      setProcessing(null)
    }
  }

  if (pedidos.length === 0) {
    return (
      <div className="bg-zinc-900 border border-white/10 rounded-xl p-8 text-center text-zinc-500 text-sm">
        Nenhum pedido aguardando análise de viabilidade.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {pedidos.map((p) => (
        <div key={p.id} className="bg-zinc-900 border border-white/10 rounded-xl p-4">
          <div className="flex items-start justify-between gap-4">
            <PedidoInfo p={p} />

            <div className="flex flex-col gap-2 w-52 shrink-0">
              <textarea
                placeholder="Justificativa de inviabilidade (obrigatório se não puder atender)"
                value={motivo[p.id] ?? ''}
                onChange={(e) => setMotivo((m) => ({ ...m, [p.id]: e.target.value }))}
                rows={3}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
              <button
                onClick={() => handleReview(p.id, 'aprovar')}
                disabled={processing === p.id}
                className="flex items-center justify-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-500/20 disabled:opacity-60 transition-colors"
                title="Capacidade disponível — iniciar atendimento conforme ordem da DSG"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                Iniciar atendimento
              </button>
              <button
                onClick={() => handleReview(p.id, 'reprovar')}
                disabled={processing === p.id || !motivo[p.id]?.trim()}
                className="flex items-center justify-center gap-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 py-1.5 rounded-lg text-xs font-medium hover:bg-orange-500/20 disabled:opacity-40 transition-colors"
                title="Registrar inviabilidade de atendimento (requer justificativa)"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Registrar inviabilidade
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Painel B: Dar Pronto (APROVADO) ─────────────────────────────────────────
function PainelDarPronto({
  pedidos,
  onRefresh,
}: {
  pedidos: Pedido[]
  onRefresh: () => void
}) {
  const [linkBdgex, setLinkBdgex] = useState<Record<number, string>>({})
  const [processing, setProcessing] = useState<number | null>(null)

  const handlePronto = async (id: number) => {
    setProcessing(id)
    try {
      await pedidosApi.cgeoReview(id, 'pronto', undefined, linkBdgex[id]?.trim() || undefined)
      toast.success('Pronto registrado! Solicitante notificado.')
      onRefresh()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao registrar pronto')
    } finally {
      setProcessing(null)
    }
  }

  if (pedidos.length === 0) {
    return (
      <div className="bg-zinc-900 border border-white/10 rounded-xl p-8 text-center text-zinc-500 text-sm">
        Nenhum pedido em atendimento aguardando entrega.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {pedidos.map((p) => (
        <div key={p.id} className="bg-zinc-900 border border-emerald-500/10 rounded-xl p-4">
          <div className="flex items-start justify-between gap-4">
            <PedidoInfo p={p} />

            <div className="flex flex-col gap-2 w-60 shrink-0">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  Link BDGEx <span className="text-zinc-600">(opcional mas recomendado)</span>
                </label>
                <input
                  type="url"
                  placeholder="https://bdgex.eb.mil.br/…"
                  value={linkBdgex[p.id] ?? ''}
                  onChange={(e) => setLinkBdgex((l) => ({ ...l, [p.id]: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
                />
              </div>
              <button
                onClick={() => handlePronto(p.id)}
                disabled={processing === p.id}
                className="flex items-center justify-center gap-1.5 bg-emerald-500 text-white py-2 rounded-lg text-xs font-semibold hover:bg-emerald-400 disabled:opacity-60 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Dar Pronto
              </button>
              {linkBdgex[p.id]?.trim() && (
                <a
                  href={linkBdgex[p.id]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Verificar link
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function CGEODashboard() {
  const [pendentes, setPendentes] = useState<Pedido[]>([])
  const [emAtendimento, setEmAtendimento] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([
      pedidosApi.listPending(),
      pedidosApi.listCgeoAtendimento(),
    ])
      .then(([pendRes, atenRes]) => {
        setPendentes(pendRes.data)
        setEmAtendimento(atenRes.data)
      })
      .catch(() => toast.error('Erro ao carregar pedidos'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Atendimento de Pedidos — CGEO</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Analise a viabilidade, inicie o atendimento e registre a entrega dos dados no BDGEx.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-white/10 px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </button>
      </div>

      {/* Painel A: análise de viabilidade */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-amber-400" />
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
            Aguardando análise de viabilidade
          </h2>
          <span className="ml-1 px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-xs font-medium">
            {pendentes.length}
          </span>
        </div>
        <PainelAnalise pedidos={pendentes} onRefresh={load} />
      </section>

      {/* Painel B: dar pronto */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
            Em atendimento — Dar Pronto
          </h2>
          <span className="ml-1 px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-xs font-medium">
            {emAtendimento.length}
          </span>
        </div>
        <PainelDarPronto pedidos={emAtendimento} onRefresh={load} />
      </section>
    </div>
  )
}
