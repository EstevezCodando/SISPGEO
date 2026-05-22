import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Trash2, RefreshCw, ChevronDown, ChevronUp, Search,
  Download, Loader2, X, CheckCircle2,
} from 'lucide-react'
import { pedidosApi } from '../../api/pedidos'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import type { Pedido } from '../../types/pedido'
import { TIPO_PRODUTO_LABELS, STATUS_LABELS } from '../../types/pedido'

/** Com quem está o pedido (escalão atual) */
const STATUS_RESPONSAVEL: Record<string, string> = {
  RASCUNHO:                'Solicitante (rascunho)',
  AGUARDANDO_SUPERVISOR:   'Supervisor CMilA (COTER)',
  AGUARDANDO_CONSOLIDADOR: 'Consolidador do órgão vinculante',
  DEVOLVIDO:               'Solicitante (em revisão)',
  AGUARDANDO_CARTOGRAFICO: 'Gestor Cartográfico — DSG',
  ATRIBUIDO_CGEO:          'CGEO (em análise)',
  APROVADO:                'CGEO (em atendimento)',
  REPROVADO:               'Encerrado — inviável',
  CANCELADO:               'Encerrado — cancelado',
  PRODUZIDO:               'Encerrado — produzido',
}

// Statuses eligible for "Dar o Pronto"
const PRONTO_ELIGIBLE = new Set([
  'AGUARDANDO_CARTOGRAFICO',
  'ATRIBUIDO_CGEO',
  'APROVADO',
])

// ─── Pronto Modal ─────────────────────────────────────────────────────────────
interface ProntoModalProps {
  pedido: Pedido
  onClose: () => void
  onDone: (updated: Pedido) => void
}

function ProntoModal({ pedido, onClose, onDone }: ProntoModalProps) {
  const [observacoes, setObservacoes] = useState('Disponível no BDGEx')
  const [linkBdgex, setLinkBdgex] = useState(pedido.link_bdgex ?? '')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if (!observacoes.trim()) {
      toast.error('Informe uma observação')
      return
    }
    setSaving(true)
    try {
      const res = await pedidosApi.darPronto(pedido.id, observacoes.trim(), linkBdgex.trim() || undefined)
      onDone(res.data)
      toast.success(`Pedido #${pedido.id} marcado como Produzido`)
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Erro ao dar o pronto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-zinc-100">
              Dar o Pronto — Pedido <span className="text-emerald-400">#{pedido.id}</span>
            </h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-zinc-400">
            O pedido será marcado como <span className="text-emerald-400 font-medium">Produzido</span> e o
            solicitante e seus superiores receberão uma notificação.
          </p>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Link BDGEx <span className="text-zinc-600">(opcional)</span>
            </label>
            <input
              type="url"
              value={linkBdgex}
              onChange={(e) => setLinkBdgex(e.target.value)}
              placeholder="https://bdgex.eb.mil.br/..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Observação <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={3}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Ex.: Disponível no BDGEx. Acesse pelo link informado."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
            />
            <p className="text-xs text-zinc-600 mt-1">
              Esta mensagem será incluída na notificação enviada ao solicitante e superiores.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !observacoes.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {saving ? 'Confirmando…' : 'Confirmar Pronto'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AdminPedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  // Selection for export
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [exporting, setExporting] = useState(false)

  // Pronto modal
  const [prontoTarget, setProntoTarget] = useState<Pedido | null>(null)

  const load = () => {
    setLoading(true)
    pedidosApi.adminAll()
      .then((r) => setPedidos(r.data))
      .catch(() => toast.error('Erro ao carregar pedidos'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleDelete = async (id: number) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id)
      return
    }
    setDeleting(id)
    try {
      await pedidosApi.adminDelete(id)
      toast.success(`Pedido #${id} removido`)
      setPedidos((prev) => prev.filter((p) => p.id !== id))
      setSelected((prev) => { const s = new Set(prev); s.delete(id); return s })
      setConfirmDelete(null)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao remover pedido')
    } finally {
      setDeleting(null)
    }
  }

  const handleProntoDone = (updated: Pedido) => {
    setPedidos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    setProntoTarget(null)
  }

  const handleExportGeoJSON = async () => {
    setExporting(true)
    try {
      const ids = selected.size > 0
        ? Array.from(selected)
        : filtered.map((p) => p.id)
      const res = await pedidosApi.exportGeoJSON({ pedido_ids: ids })
      const blob = new Blob([res.data], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = (res.headers as Record<string, string>)['content-disposition'] ?? ''
      const match = disposition.match(/filename=([^\s;]+)/)
      a.download = match?.[1] ?? `pedido_sispgeo_${format(new Date(), 'yyyyMMdd_HHmm')}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Pedidos baixados com sucesso')
    } catch {
      toast.error('Erro ao baixar pedidos')
    } finally {
      setExporting(false)
    }
  }

  const filtered = pedidos.filter((p) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      String(p.id).includes(q) ||
      (p.usuario_nome ?? '').toLowerCase().includes(q) ||
      (p.operacao_nome ?? '').toLowerCase().includes(q) ||
      p.status.toLowerCase().includes(q) ||
      p.orgao_vinculante.toLowerCase().includes(q)
    )
  })

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id))
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected((prev) => {
        const s = new Set(prev)
        filtered.forEach((p) => s.delete(p.id))
        return s
      })
    } else {
      setSelected((prev) => {
        const s = new Set(prev)
        filtered.forEach((p) => s.add(p.id))
        return s
      })
    }
  }
  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Todos os Pedidos</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Todos os pedidos do sistema em qualquer etapa — {pedidos.length} no total
            {selected.size > 0 && (
              <span className="ml-2 text-emerald-400">{selected.size} selecionados</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportGeoJSON}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-60 transition-colors"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {exporting ? 'Baixando…' : selected.size > 0 ? `Baixar pedidos (${selected.size})` : 'Baixar pedidos'}
          </button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-zinc-400 border border-white/10 hover:bg-white/5 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Buscar por ID, solicitante, operação, status..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-12 text-center text-zinc-500">
          {pedidos.length === 0 ? 'Nenhum pedido no sistema.' : 'Nenhum pedido encontrado para este filtro.'}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-white/10 text-xs">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">#</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Solicitante</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Órgão Vinculante</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Com quem está</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Data sol. Entrega</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Criado em</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((p) => (
                <>
                  <tr
                    key={p.id}
                    className={`hover:bg-white/5 transition-colors cursor-pointer ${selected.has(p.id) ? 'bg-emerald-500/5' : ''}`}
                    onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="px-4 py-3 font-bold text-emerald-400">#{p.id}</td>
                    <td className="px-4 py-3 text-zinc-200">{p.usuario_nome ?? '—'}</td>
                    <td className="px-4 py-3 text-zinc-400">{p.orgao_vinculante}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-white/5 text-zinc-300">
                        {STATUS_RESPONSAVEL[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {format(new Date(p.data_entrega + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      {format(new Date(p.criado_em), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {/* Expand */}
                        <button
                          onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                          className="p-1.5 rounded-md hover:bg-white/5 text-zinc-500 transition-colors"
                        >
                          {expanded === p.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        {/* Dar o Pronto */}
                        {PRONTO_ELIGIBLE.has(p.status) && (
                          <button
                            onClick={() => setProntoTarget(p)}
                            title="Dar o Pronto"
                            className="p-1.5 rounded-md hover:bg-emerald-500/10 text-zinc-500 hover:text-emerald-400 transition-colors"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}
                        {/* Excluir */}
                        {confirmDelete === p.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(p.id)}
                              disabled={deleting === p.id}
                              className="px-2 py-1 text-xs bg-red-500/10 border border-red-500/30 text-red-400 rounded-md hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                            >
                              {deleting === p.id ? '...' : 'Confirmar'}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="px-2 py-1 text-xs text-zinc-500 border border-white/10 rounded-md hover:bg-white/5 transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-1.5 rounded-md hover:bg-red-500/10 text-zinc-600 hover:text-red-400 transition-colors"
                            title="Remover pedido"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {expanded === p.id && (
                    <tr key={`${p.id}-detail`}>
                      <td colSpan={9} className="px-6 py-4 bg-zinc-800/40">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                          {/* Itens */}
                          <div>
                            <p className="font-semibold text-zinc-400 mb-2">Itens solicitados ({p.itens.length})</p>
                            <div className="space-y-1">
                              {p.itens.map((item) => (
                                <div key={item.id} className="flex items-start gap-2 text-zinc-400">
                                  <span className="font-mono text-zinc-500 shrink-0">{item.inom}</span>
                                  <span>—</span>
                                  <span>{TIPO_PRODUTO_LABELS[item.tipo_produto]}</span>
                                  <span className="text-zinc-600">({item.escala})</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Detalhes */}
                          <div>
                            <p className="font-semibold text-zinc-400 mb-2">Detalhes</p>
                            <div className="space-y-1 text-zinc-500">
                              {p.operacao_nome && <p><span className="text-zinc-400">Operação:</span> {p.operacao_nome}</p>}
                              {p.finalidade && <p><span className="text-zinc-400">Finalidade:</span> {p.finalidade}</p>}
                              {p.observacoes && <p><span className="text-zinc-400">Observações:</span> {p.observacoes}</p>}
                              {p.link_bdgex && (
                                <p>
                                  <span className="text-zinc-400">BDGEx:</span>{' '}
                                  <a href={p.link_bdgex} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">
                                    Acessar ↗
                                  </a>
                                </p>
                              )}
                              {p.motivo_reprovacao && (
                                <p className="text-orange-400">
                                  <span className="font-medium">Motivo inviabilidade:</span> {p.motivo_reprovacao}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Situação */}
                          <div>
                            <p className="font-semibold text-zinc-400 mb-2">Situação atual</p>
                            <div className="text-zinc-500 space-y-1">
                              <p><span className="text-zinc-400">Status:</span> {STATUS_LABELS[p.status]}</p>
                              <p><span className="text-zinc-400">Responsável:</span> {STATUS_RESPONSAVEL[p.status]}</p>
                              <p><span className="text-zinc-400">Prioridade:</span> {p.prioridade}</p>
                              {p.regiao_militar && <p><span className="text-zinc-400">CMilA:</span> {p.regiao_militar}</p>}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pronto Modal ───────────────────────────────────────────────── */}
      {prontoTarget && (
        <ProntoModal
          pedido={prontoTarget}
          onClose={() => setProntoTarget(null)}
          onDone={handleProntoDone}
        />
      )}
    </div>
  )
}
