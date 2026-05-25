import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Download, Copy, ChevronDown, ChevronUp, Loader2, AlertTriangle,
  Pencil, Trash2, X, Check, CheckCircle2,
} from 'lucide-react'
import {
  pedidosApi, type DuplicateItem, type AdminUpdatePayload,
} from '../../api/pedidos'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import type { Pedido } from '../../types/pedido'
import { TIPO_PRODUTO_LABELS, STATUS_LABELS } from '../../types/pedido'

// ─── Constants ────────────────────────────────────────────────────────────────
const ALL_STATUSES = [
  'RASCUNHO',
  'AGUARDANDO_SUPERVISOR',
  'AGUARDANDO_CONSOLIDADOR',
  'DEVOLVIDO',
  'AGUARDANDO_CARTOGRAFICO',
  'ATRIBUIDO_CGEO',
  'APROVADO',
  'REPROVADO',
  'CANCELADO',
  'PRODUZIDO',
] as const

// Statuses that have reached DSG stage (already passed through all upstream processes)
const DSG_STATUSES = [
  'AGUARDANDO_CARTOGRAFICO',
  'ATRIBUIDO_CGEO',
  'APROVADO',
  'REPROVADO',
  'PRODUZIDO',
] as const

const ALL_ORGAOS = ['COTER', 'DECEx', 'COLOG', 'DEC'] as const

// Statuses on which DSG can "dar o pronto"
const PRONTO_ELIGIBLE = new Set([
  'AGUARDANDO_CARTOGRAFICO',
  'ATRIBUIDO_CGEO',
  'APROVADO',
])

const PAGE_SIZE = 50

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
        {/* Header */}
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

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-zinc-400">
            O pedido será marcado como <span className="text-emerald-400 font-medium">Produzido</span> e o
            solicitante e seus superiores serão notificados.
          </p>

          {/* Link BDGEx */}
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

          {/* Observação */}
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

        {/* Footer */}
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

// ─── Edit Modal ───────────────────────────────────────────────────────────────
interface EditModalProps {
  pedido: Pedido
  onClose: () => void
  onSaved: (updated: Pedido) => void
}

function EditModal({ pedido, onClose, onSaved }: EditModalProps) {
  const [form, setForm] = useState<AdminUpdatePayload>({
    status: pedido.status,
    data_entrega: pedido.data_entrega,
    finalidade: pedido.finalidade ?? '',
    observacoes: pedido.observacoes ?? '',
    motivo_reprovacao: pedido.motivo_reprovacao ?? '',
    link_bdgex: pedido.link_bdgex ?? '',
    prioridade: pedido.prioridade,
    cgeo_id: pedido.cgeo_id ?? undefined,
    orgao_vinculante: pedido.orgao_vinculante,
  })
  const [saving, setSaving] = useState(false)

  const set = (k: keyof AdminUpdatePayload, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: Partial<AdminUpdatePayload> = {}
      if (form.status !== pedido.status) payload.status = form.status
      if (form.data_entrega !== pedido.data_entrega) payload.data_entrega = form.data_entrega
      if (form.finalidade !== (pedido.finalidade ?? '')) payload.finalidade = form.finalidade
      if (form.observacoes !== (pedido.observacoes ?? '')) payload.observacoes = form.observacoes
      if (form.motivo_reprovacao !== (pedido.motivo_reprovacao ?? ''))
        payload.motivo_reprovacao = form.motivo_reprovacao
      if (form.link_bdgex !== (pedido.link_bdgex ?? '')) payload.link_bdgex = form.link_bdgex
      if (form.prioridade !== pedido.prioridade) payload.prioridade = form.prioridade
      if (form.cgeo_id !== (pedido.cgeo_id ?? undefined)) payload.cgeo_id = form.cgeo_id
      if (form.orgao_vinculante !== pedido.orgao_vinculante)
        payload.orgao_vinculante = form.orgao_vinculante

      const res = await pedidosApi.adminUpdate(pedido.id, payload)
      onSaved(res.data)
      toast.success(`Pedido #${pedido.id} atualizado`)
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 shrink-0">
          <h2 className="text-base font-semibold text-zinc-100">
            Editar Pedido <span className="text-emerald-400">#{pedido.id}</span>
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Órgão Vinculante */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Órgão Vinculante</label>
            <select
              value={form.orgao_vinculante}
              onChange={(e) => set('orgao_vinculante', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {ALL_ORGAOS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          {/* Data de entrega */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Data de Entrega</label>
            <input
              type="date"
              value={form.data_entrega ?? ''}
              onChange={(e) => set('data_entrega', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Prioridade */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Prioridade</label>
            <input
              type="number"
              value={form.prioridade ?? ''}
              onChange={(e) => set('prioridade', e.target.value ? Number(e.target.value) : undefined)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* CGEO ID */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">CGEO ID</label>
            <input
              type="number"
              value={form.cgeo_id ?? ''}
              onChange={(e) => set('cgeo_id', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="Deixe vazio para não alterar"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Finalidade */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Finalidade</label>
            <textarea
              rows={2}
              value={form.finalidade ?? ''}
              onChange={(e) => set('finalidade', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Observações</label>
            <textarea
              rows={2}
              value={form.observacoes ?? ''}
              onChange={(e) => set('observacoes', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Motivo reprovação — visível só se REPROVADO */}
          {form.status === 'REPROVADO' && (
            <div>
              <label className="block text-xs font-medium text-amber-400 mb-1">
                Motivo de Reprovação
              </label>
              <textarea
                rows={2}
                value={form.motivo_reprovacao ?? ''}
                onChange={(e) => set('motivo_reprovacao', e.target.value)}
                className="w-full bg-zinc-800 border border-amber-500/30 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
              />
            </div>
          )}

          {/* Link BDGEx */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Link BDGEx</label>
            <input
              type="text"
              value={form.link_bdgex ?? ''}
              onChange={(e) => set('link_bdgex', e.target.value)}
              placeholder="https://..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5 border-t border-white/10 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Duplicates Panel ─────────────────────────────────────────────────────────
interface DuplicatesPanelProps {
  open: boolean
  onToggle: () => void
}

function DuplicatesPanel({ open, onToggle }: DuplicatesPanelProps) {
  const [duplicates, setDuplicates] = useState<DuplicateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const loadDuplicates = async () => {
    setLoading(true)
    try {
      const res = await pedidosApi.getDuplicatas()
      setDuplicates(res.data)
      setLoaded(true)
    } catch {
      toast.error('Erro ao verificar duplicatas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && !loaded) loadDuplicates()
  }, [open])

  return (
    <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          {loaded && duplicates.length > 0 ? (
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          ) : (
            <Copy className="h-4 w-4 text-zinc-400" />
          )}
          <span className="text-sm font-semibold text-zinc-100">Verificar Duplicatas</span>
          {loaded && (
            <span className={`text-xs px-2 py-0.5 rounded border ${
              duplicates.length > 0
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}>
              {duplicates.length > 0 ? `${duplicates.length} grupo(s)` : 'Sem duplicatas'}
            </span>
          )}
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
      </button>

      {open && loaded && (
        <div className="px-5 pb-5 space-y-3 border-t border-white/10 pt-4">
          <div className="flex justify-end">
            <button
              onClick={loadDuplicates}
              disabled={loading}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline"
            >
              {loading ? 'Verificando…' : 'Reverificar'}
            </button>
          </div>

          {duplicates.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">
              Nenhum item duplicado encontrado nos pedidos ativos.
            </p>
          ) : (
            duplicates.map((dup, idx) => (
              <div key={idx} className="bg-zinc-800/60 border border-amber-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-xs font-semibold text-emerald-400 font-mono">{dup.inom}</span>
                  {dup.mi && <span className="text-xs text-zinc-500">MI: {dup.mi}</span>}
                  <span className="text-zinc-600">·</span>
                  <span className="text-xs text-zinc-300">
                    {TIPO_PRODUTO_LABELS[dup.tipo_produto as keyof typeof TIPO_PRODUTO_LABELS] ?? dup.tipo_produto}
                  </span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-xs text-zinc-400">{dup.escala}</span>
                  <span className="ml-auto text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded px-2 py-0.5">
                    {dup.pedidos.length} pedidos
                  </span>
                </div>
                <div className="space-y-1.5">
                  {dup.pedidos.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 text-xs">
                      <span className="text-emerald-400 font-semibold w-8">#{p.id}</span>
                      <span className="text-zinc-300 flex-1">{p.usuario_nome ?? '—'}</span>
                      <StatusBadge status={p.status as any} />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function DSGDashboard() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)

  // Filters — default to DSG-stage statuses (pedidos que já passaram por todos os processos)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterOrgao, setFilterOrgao] = useState('')
  const [filterQ, setFilterQ] = useState('')

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Table
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [page, setPage] = useState(0)

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Edit modal
  const [editingPedido, setEditingPedido] = useState<Pedido | null>(null)

  // Pronto modal
  const [prontoTarget, setProntoTarget] = useState<Pedido | null>(null)

  // Load only DSG-stage pedidos by default (those that have completed all upstream steps)
  const load = (params?: { status?: string; orgao_vinculante?: string; q?: string }) => {
    setLoading(true)
    pedidosApi.adminAll(params)
      .then((r) => {
        // If no status filter is applied, show only DSG-stage pedidos
        const data = (!params?.status)
          ? r.data.filter((p) => DSG_STATUSES.includes(p.status as any))
          : r.data
        setPedidos(data)
        setSelected(new Set())
        setPage(0)
      })
      .catch(() => toast.error('Erro ao carregar pedidos'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const applyFilters = () => {
    load({
      status: filterStatus || undefined,
      orgao_vinculante: filterOrgao || undefined,
      q: filterQ || undefined,
    })
  }

  const handleExportGeoJSON = async () => {
    setExporting(true)
    try {
      const ids = selected.size > 0
        ? Array.from(selected)
        : pedidos.map((p) => p.id)
      const res = await pedidosApi.exportGeoJSON({ pedido_ids: ids })
      const blob = new Blob([res.data], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // extrai nome do Content-Disposition ou usa fallback
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

  const handleDelete = async (id: number) => {
    setDeleting(true)
    try {
      await pedidosApi.adminDelete(id)
      toast.success(`Pedido #${id} removido`)
      setPedidos((prev) => prev.filter((p) => p.id !== id))
      setSelected((prev) => { const s = new Set(prev); s.delete(id); return s })
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Erro ao remover pedido')
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }

  const handleSaved = (updated: Pedido) => {
    setPedidos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  const handleProntoDone = (updated: Pedido) => {
    setPedidos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  // Pagination
  const totalPages = Math.ceil(pedidos.length / PAGE_SIZE)
  const paginated = pedidos.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Select all (on current page)
  const allPageSelected = paginated.length > 0 && paginated.every((p) => selected.has(p.id))
  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelected((prev) => { const s = new Set(prev); paginated.forEach((p) => s.delete(p.id)); return s })
    } else {
      setSelected((prev) => { const s = new Set(prev); paginated.forEach((p) => s.add(p.id)); return s })
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
    <div className="space-y-5">
      {/* ── Barra de ações ────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Pedidos DSG</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Pedidos que chegaram à DSG — {pedidos.length} exibidos
              {selected.size > 0 && (
                <span className="ml-2 text-emerald-400">{selected.size} selecionados</span>
              )}
            </p>
          </div>

          <button
            onClick={() => setShowDuplicates((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            <Copy className="h-4 w-4" />
            Duplicatas
          </button>

          <button
            onClick={handleExportGeoJSON}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 disabled:opacity-60 transition-colors"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? 'Baixando…' : selected.size > 0 ? `Baixar pedidos (${selected.size})` : 'Baixar pedidos'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Etapa DSG (padrão)</option>
            <option value="">— Todos os status —</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>

          <select
            value={filterOrgao}
            onChange={(e) => setFilterOrgao(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Todos os órgãos</option>
            {ALL_ORGAOS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>

          <input
            type="text"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="Buscar por nome ou INOM…"
            className="flex-1 min-w-48 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />

          <button
            onClick={applyFilters}
            className="px-4 py-1.5 rounded-lg bg-zinc-700 border border-zinc-600 text-sm text-zinc-200 hover:bg-zinc-600 transition-colors"
          >
            Filtrar
          </button>
        </div>
      </div>

      {/* ── Painel de duplicatas ───────────────────────────────────────── */}
      <DuplicatesPanel open={showDuplicates} onToggle={() => setShowDuplicates((v) => !v)} />

      {/* ── Tabela ────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10">
            <tr>
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-400">#</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-400">Solicitante</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-400 hidden md:table-cell">CMilA</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-400 hidden lg:table-cell">Órgão</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-400 hidden lg:table-cell">Operação</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-400">Itens</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-400">Status</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-400 hidden md:table-cell">Entrega</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-400">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {paginated.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-zinc-500">
                  Nenhum pedido encontrado.
                </td>
              </tr>
            )}
            {paginated.map((p) => (
              <>
                <tr
                  key={p.id}
                  className={`hover:bg-white/5 transition-colors ${selected.has(p.id) ? 'bg-emerald-500/5' : ''}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setExpandedRow(expandedRow === p.id ? null : p.id)}
                      className="flex items-center gap-1 font-medium text-emerald-400 hover:text-emerald-300"
                    >
                      #{p.id}
                      {expandedRow === p.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-zinc-200">{p.usuario_nome ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs hidden md:table-cell">{p.regiao_militar ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs hidden lg:table-cell">{p.orgao_vinculante ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs hidden lg:table-cell">{p.operacao_nome ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    <span className="text-zinc-300">{p.itens.length}</span>
                    <span className="text-zinc-600 ml-1 text-xs">
                      {[...new Set(p.itens.map((i) => TIPO_PRODUTO_LABELS[i.tipo_produto]))].join(', ')}
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 text-zinc-400 text-xs hidden md:table-cell">
                    {p.data_entrega
                      ? format(new Date(p.data_entrega + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })
                      : '—'}
                  </td>
                  {/* Ações */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {/* Dar o Pronto */}
                      {PRONTO_ELIGIBLE.has(p.status) && (
                        <button
                          onClick={() => setProntoTarget(p)}
                          title="Dar o Pronto"
                          className="p-1.5 rounded-md hover:bg-emerald-500/10 text-zinc-400 hover:text-emerald-400 transition-colors"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {/* Editar */}
                      <button
                        onClick={() => setEditingPedido(p)}
                        title="Editar"
                        className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {/* Excluir */}
                      {confirmDelete === p.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(p.id)}
                            disabled={deleting}
                            className="px-2 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-400 disabled:opacity-60 transition-colors"
                          >
                            {deleting ? '…' : 'Confirmar'}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-2 py-1 rounded text-xs bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(p.id)}
                          title="Excluir"
                          className="p-1.5 rounded-md hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expanded items */}
                {expandedRow === p.id && (
                  <tr key={`${p.id}-items`} className="bg-zinc-800/40">
                    <td colSpan={10} className="px-6 py-3">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-zinc-500 mb-2">
                          Itens por prioridade
                          {p.finalidade_geo && (
                            <span className="ml-2 italic text-zinc-600">· {p.finalidade_geo}</span>
                          )}
                          {p.finalidade && (
                            <span className="ml-2 italic text-zinc-600">· {p.finalidade}</span>
                          )}
                          {p.observacoes && (
                            <span className="ml-2 text-zinc-500">· Obs: {p.observacoes}</span>
                          )}
                          {p.link_bdgex && (
                            <a
                              href={p.link_bdgex}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-emerald-400 underline"
                            >
                              BDGEx ↗
                            </a>
                          )}
                        </p>
                        {[...p.itens]
                          .sort((a, b) => a.prioridade - b.prioridade)
                          .map((item, idx) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-2.5 text-xs bg-zinc-800 border border-zinc-700/40 rounded-lg px-3 py-2"
                            >
                              <span className="text-zinc-600 w-4 text-center shrink-0">{idx + 1}</span>
                              <span className="text-emerald-400 font-mono font-medium">{item.inom}</span>
                              {item.mi && <span className="text-zinc-500">MI: {item.mi}</span>}
                              <span className="text-zinc-400">{TIPO_PRODUTO_LABELS[item.tipo_produto]}</span>
                              <span className="text-zinc-600">·</span>
                              <span className="text-zinc-500">{item.escala}</span>
                              {item.disponivel_bdgex && (
                                <span className="ml-auto text-emerald-500 font-medium">✓ BDGEx</span>
                              )}
                            </div>
                          ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
            <span className="text-xs text-zinc-500">
              Página {page + 1} de {totalPages} · {pedidos.length} pedidos
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 rounded-lg text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 rounded-lg text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Edit Modal ─────────────────────────────────────────────────── */}
      {editingPedido && (
        <EditModal
          pedido={editingPedido}
          onClose={() => setEditingPedido(null)}
          onSaved={handleSaved}
        />
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
