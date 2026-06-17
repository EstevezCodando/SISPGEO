import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Download, Copy, ChevronDown, ChevronUp, Loader2, AlertTriangle,
  Pencil, Trash2, X, Check, CheckCircle2, Phone, Mail, Building2,
  Briefcase, Info, Printer, ExternalLink, FileText, CalendarClock,
  Search, Filter,
} from 'lucide-react'
import {
  pedidosApi, type DuplicateItem, type BDGExAgeItem, type AdminUpdatePayload,
} from '../../api/pedidos'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import type { Pedido } from '../../types/pedido'
import { TIPO_PRODUTO_LABELS, STATUS_LABELS } from '../../types/pedido'
import { formatNomeComPosto } from '../../data/postos'

// ─── Constants ────────────────────────────────────────────────────────────────
const ALL_STATUSES = [
  'RASCUNHO',
  'AGUARDANDO_SUPERVISOR',
  'AGUARDANDO_CONSOLIDADOR',
  'AGUARDANDO_CARTOGRAFICO',
  'ATRIBUIDO_CGEO',
  'APROVADO',
  'REPROVADO',
  'CANCELADO',
  'PRODUZIDO',
] as const

const DSG_STATUSES = [
  'AGUARDANDO_CARTOGRAFICO',
  'ATRIBUIDO_CGEO',
  'APROVADO',
  'REPROVADO',
  'PRODUZIDO',
] as const

const ALL_ORGAOS = ['COTER', 'DECEx', 'COLOG', 'DEC', 'DSG'] as const

const PRONTO_ELIGIBLE = new Set([
  'AGUARDANDO_CARTOGRAFICO',
  'ATRIBUIDO_CGEO',
  'APROVADO',
])

const PAGE_SIZE = 50

// ─── BDGEx age helpers ────────────────────────────────────────────────────────
function calcAge(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (365.25 * 24 * 3600 * 1000))
}

function ageColor(age: number | null): string {
  if (age === null) return 'text-zinc-600'
  if (age < 5)  return 'text-emerald-400'
  if (age < 10) return 'text-lime-400'
  if (age < 20) return 'text-yellow-400'
  if (age < 30) return 'text-orange-400'
  return 'text-red-400'
}

function ageBgColor(age: number | null): string {
  if (age === null) return 'bg-zinc-800 border-zinc-700/40'
  if (age < 5)  return 'bg-emerald-500/10 border-emerald-500/20'
  if (age < 10) return 'bg-lime-500/10 border-lime-500/20'
  if (age < 20) return 'bg-yellow-500/10 border-yellow-500/20'
  if (age < 30) return 'bg-orange-500/10 border-orange-500/20'
  return 'bg-red-500/10 border-red-500/20'
}

const ORG_CLS: Record<string, string> = {
  COTER: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  DEC:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  COLOG: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  DECEx: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  DSG:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

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
    if (!observacoes.trim()) { toast.error('Informe uma observação'); return }
    setSaving(true)
    try {
      const res = await pedidosApi.darPronto(pedido.id, observacoes.trim(), linkBdgex.trim() || undefined)
      onDone(res.data)
      toast.success(`Pedido #${pedido.id} marcado como Produzido`)
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao dar o pronto')
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
              Dar o Pronto — <span className="text-emerald-400">#{pedido.id}</span>
            </h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-zinc-400">
            O pedido será marcado como <span className="text-emerald-400 font-medium">Produzido</span> e o
            solicitante e superiores serão notificados.
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
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
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
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/10 shrink-0">
          <h2 className="text-base font-semibold text-zinc-100">
            Editar Pedido <span className="text-emerald-400">#{pedido.id}</span>
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Status</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500">
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Órgão Vinculante</label>
            <select value={form.orgao_vinculante} onChange={(e) => set('orgao_vinculante', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500">
              {ALL_ORGAOS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Data de Entrega</label>
            <input type="date" value={form.data_entrega ?? ''} onChange={(e) => set('data_entrega', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Prioridade</label>
            <input type="number" value={form.prioridade ?? ''} onChange={(e) => set('prioridade', e.target.value ? Number(e.target.value) : undefined)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">CGEO ID</label>
            <input type="number" value={form.cgeo_id ?? ''} onChange={(e) => set('cgeo_id', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="Deixe vazio para não alterar"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Finalidade</label>
            <textarea rows={2} value={form.finalidade ?? ''} onChange={(e) => set('finalidade', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Observações</label>
            <textarea rows={2} value={form.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none" />
          </div>
          {form.status === 'REPROVADO' && (
            <div>
              <label className="block text-xs font-medium text-amber-400 mb-1">Motivo de Reprovação</label>
              <textarea rows={2} value={form.motivo_reprovacao ?? ''} onChange={(e) => set('motivo_reprovacao', e.target.value)}
                className="w-full bg-zinc-800 border border-amber-500/30 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Link BDGEx</label>
            <input type="text" value={form.link_bdgex ?? ''} onChange={(e) => set('link_bdgex', e.target.value)}
              placeholder="https://..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-white/10 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 disabled:opacity-60 transition-colors">
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

  useEffect(() => { if (open && !loaded) loadDuplicates() }, [open])

  return (
    <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-2">
          {loaded && duplicates.length > 0
            ? <AlertTriangle className="h-4 w-4 text-amber-400" />
            : <Copy className="h-4 w-4 text-zinc-400" />}
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
            <button onClick={loadDuplicates} disabled={loading}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline">
              {loading ? 'Verificando…' : 'Reverificar'}
            </button>
          </div>
          {duplicates.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">Nenhum item duplicado nos pedidos ativos.</p>
          ) : (
            duplicates.map((dup, idx) => (
              <div key={idx} className="bg-zinc-800/60 border border-amber-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {dup.mi
                    ? <span className="text-xs font-semibold text-emerald-400 font-mono">{dup.mi}</span>
                    : <span className="text-xs font-semibold text-emerald-400 font-mono">{dup.inom}</span>
                  }
                  {dup.mi && <span className="text-xs text-zinc-500 font-mono">({dup.inom})</span>}
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
                      <StatusBadge status={p.status as Parameters<typeof StatusBadge>[0]['status']} />
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

// ─── BDGEx Age Panel ─────────────────────────────────────────────────────────
interface BDGExAgePanelProps {
  open: boolean
  onToggle: () => void
}
function BDGExAgePanel({ open, onToggle }: BDGExAgePanelProps) {
  const [anos, setAnos] = useState(5)
  const [items, setItems] = useState<BDGExAgeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [lastAnos, setLastAnos] = useState<number | null>(null)

  const loadItems = async () => {
    setLoading(true)
    try {
      const res = await pedidosApi.getProdutosRecentes(anos)
      setItems(res.data)
      setLastAnos(anos)
      setLoaded(true)
    } catch {
      toast.error('Erro ao verificar produtos recentes no BDGEx')
    } finally {
      setLoading(false)
    }
  }

  const ageColorCls = (idade: number) => {
    if (idade < 1) return 'text-red-400 bg-red-500/10 border-red-500/20'
    if (idade < 2) return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
    if (idade < 4) return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    return 'text-sky-400 bg-sky-500/10 border-sky-500/20'
  }

  const ageLabel = (idade: number): string => {
    if (idade < 1) return `${Math.round(idade * 12)} meses`
    const a = Math.floor(idade)
    const m = Math.round((idade - a) * 12)
    if (m === 0) return `${a} ano${a !== 1 ? 's' : ''}`
    return `${a}a ${m}m`
  }

  return (
    <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CalendarClock className={`h-4 w-4 ${loaded && items.length > 0 ? 'text-sky-400' : 'text-zinc-400'}`} />
          <span className="text-sm font-semibold text-zinc-100">Produtos Recentes no BDGEx</span>
          {loaded && lastAnos !== null && (
            <span className={`text-xs px-2 py-0.5 rounded border ${
              items.length > 0
                ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}>
              {items.length > 0
                ? `${items.length} produto(s) < ${lastAnos} ano${lastAnos !== 1 ? 's' : ''}`
                : `Nenhum < ${lastAnos} ano${lastAnos !== 1 ? 's' : ''}`}
            </span>
          )}
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-white/10 pt-4">
          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-zinc-400">Produtos com menos de</span>
            <input
              type="number"
              min={1}
              max={50}
              value={anos}
              onChange={e => setAnos(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              className="w-16 text-center bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <span className="text-xs text-zinc-400">ano(s) no BDGEx</span>
            <button
              onClick={loadItems}
              disabled={loading}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/20 border border-sky-500/30 text-xs font-medium text-sky-300 hover:bg-sky-600/30 transition-colors disabled:opacity-50"
            >
              {loading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <CalendarClock className="h-3.5 w-3.5" />}
              {loading ? 'Verificando…' : loaded ? 'Reverificar' : 'Verificar'}
            </button>
          </div>

          {/* Results */}
          {!loaded ? (
            <p className="text-xs text-zinc-600 text-center py-4">
              Defina o limite em anos e clique em Verificar.
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">
              Nenhum produto com menos de {lastAnos} ano{lastAnos !== 1 ? 's' : ''} nos pedidos ativos.
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="bg-zinc-800/60 border border-sky-500/20 rounded-lg p-4">
                  {/* Product header */}
                  <div className="flex items-start gap-2 mb-3 flex-wrap">
                    {item.mi
                      ? <span className="text-xs font-semibold text-emerald-400 font-mono">{item.mi}</span>
                      : <span className="text-xs font-semibold text-emerald-400 font-mono">{item.inom}</span>
                    }
                    {item.mi && <span className="text-xs text-zinc-500 font-mono">({item.inom})</span>}
                    <span className="text-zinc-600">·</span>
                    <span className="text-xs text-zinc-300">
                      {TIPO_PRODUTO_LABELS[item.tipo_produto as keyof typeof TIPO_PRODUTO_LABELS] ?? item.tipo_produto}
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-xs text-zinc-400">{item.escala}</span>

                    <div className="ml-auto flex items-center gap-2 shrink-0">
                      <span className="text-xs text-zinc-500">
                        {format(new Date(item.data_producao_bdgex + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${ageColorCls(item.idade_anos)}`}>
                        {ageLabel(item.idade_anos)}
                      </span>
                    </div>
                  </div>

                  {/* Pedidos list */}
                  <div className="space-y-1.5">
                    {item.pedidos.map((p) => (
                      <div key={p.pedido_id} className="flex items-center gap-3 text-xs">
                        <span className="text-emerald-400 font-semibold font-mono w-10">#{p.pedido_id}</span>
                        <span className="text-zinc-300 flex-1 truncate">{p.usuario_nome || '—'}</span>
                        {p.om && <span className="text-zinc-500 shrink-0 truncate max-w-[120px]">{p.om}</span>}
                        <StatusBadge status={p.status as Parameters<typeof StatusBadge>[0]['status']} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Pedido DSG Card ──────────────────────────────────────────────────────────
interface PedidoDSGCardProps {
  pedido: Pedido
  rank: number
  isExpanded: boolean
  isSelected: boolean
  onToggleSelect: (id: number) => void
  onToggleExpand: (id: number) => void
  onPronto: (p: Pedido) => void
  onEdit: (p: Pedido) => void
  onDelete: (id: number) => void
}

function PedidoDSGCard({
  pedido: p, rank, isExpanded, isSelected,
  onToggleSelect, onToggleExpand, onPronto, onEdit, onDelete,
}: PedidoDSGCardProps) {
  const tipos = [...new Set(p.itens.map(i => TIPO_PRODUTO_LABELS[i.tipo_produto]))].join(' · ') || '—'
  const temImpressao = p.impressao_solicitada || p.itens.some(i => i.impressao_quantidade)

  const descricao = p.finalidade_geo
    ? p.finalidade_geo
    : p.operacao_nome
      ? p.operacao_nome
      : p.finalidade
        ? (p.finalidade.length > 70 ? p.finalidade.substring(0, 70) + '…' : p.finalidade)
        : null

  const dataEntregaFmt = p.data_entrega
    ? format(new Date(p.data_entrega + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })
    : null

  const nomeDisplay = formatNomeComPosto(
    p.usuario_nome ?? '',
    p.usuario_posto_graduacao,
    p.usuario_nome_de_guerra,
  ) || '—'

  return (
    <div className={`bg-zinc-900 border rounded-xl overflow-hidden transition-colors ${
      isSelected ? 'border-emerald-500/30' : 'border-white/10'
    }`}>
      {/* ── Summary row ── */}
      <div className="flex items-center gap-2 px-3 py-3">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(p.id)}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer accent-emerald-500 shrink-0"
        />

        {/* Rank */}
        <span className="text-[11px] font-bold text-zinc-600 w-5 text-center shrink-0">{rank}</span>

        {/* ID */}
        <span className="font-mono font-semibold text-emerald-400 text-sm shrink-0">#{p.id}</span>

        {/* Main — clicável */}
        <button type="button" onClick={() => onToggleExpand(p.id)} className="flex-1 min-w-0 text-left">
          {/* Solicitante — posto + NG + OM + subordinação */}
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="text-sm font-semibold text-zinc-100 leading-tight truncate">{nomeDisplay}</span>
            {p.usuario_om && <span className="text-xs text-zinc-500 truncate">{p.usuario_om}</span>}
            {/* Chips de subordinação */}
            {p.orgao_vinculante === 'COTER' && p.regiao_militar ? (
              <>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0 font-medium">{p.regiao_militar}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">COTER</span>
              </>
            ) : p.orgao_vinculante ? (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 font-medium ${ORG_CLS[p.orgao_vinculante] ?? 'bg-zinc-700/50 text-zinc-400 border-zinc-600/30'}`}>{p.orgao_vinculante}</span>
            ) : null}
          </div>
          {/* Finalidade */}
          {descricao && <p className="text-xs text-zinc-500 mt-0.5 truncate leading-snug">{descricao}</p>}
          {/* Produtos + itens + impressão */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[11px] text-zinc-500">{tipos}</span>
            <span className="text-zinc-700">·</span>
            <span className="text-[11px] text-zinc-600">{p.itens.length} item(ns)</span>
            {temImpressao && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-violet-400 shrink-0">
                <Printer className="h-3 w-3" /> Impressão
              </span>
            )}
          </div>
        </button>

        {/* Status + entrega */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge status={p.status} />
          {dataEntregaFmt && (
            <div className="flex items-center gap-1 text-[10px] text-zinc-500">
              <CalendarClock className="h-3 w-3" />
              {dataEntregaFmt}
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggleExpand(p.id)}
            className={`p-1.5 rounded-md transition-colors ${isExpanded ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
            title={isExpanded ? 'Fechar' : 'Expandir'}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {PRONTO_ELIGIBLE.has(p.status) && (
            <button
              onClick={() => onPronto(p)}
              className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              title="Dar o Pronto"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => onEdit(p)}
            className="p-1.5 rounded-md text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(p.id)}
            className="p-1.5 rounded-md text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            title="Excluir"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Expanded details ── */}
      {isExpanded && (
        <div className="border-t border-white/10 px-4 py-4 space-y-4">
          {/* Finalidade geo + complementar */}
          {(p.finalidade_geo || p.operacao_nome || p.finalidade) && (
            <div className="space-y-1.5">
              {(p.finalidade_geo || p.operacao_nome) && (
                <div className="flex items-start gap-2">
                  <Briefcase className="h-3.5 w-3.5 text-emerald-500/80 shrink-0 mt-0.5" />
                  <span className="text-xs font-semibold text-zinc-200">{p.finalidade_geo || p.operacao_nome}</span>
                </div>
              )}
              {p.finalidade && (
                <p className="text-xs text-zinc-400 pl-5">
                  <span className="font-medium text-zinc-300">Inf. Complementar: </span>
                  {p.finalidade}
                </p>
              )}
            </div>
          )}

          {/* Contato do solicitante */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {p.usuario_secao_om && (
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Info className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <span>{p.usuario_secao_om}</span>
              </div>
            )}
            {p.usuario_om && (
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Building2 className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <span>{p.usuario_om}</span>
              </div>
            )}
            {p.usuario_telefone && (
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Phone className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <span>{p.usuario_telefone}</span>
              </div>
            )}
            {p.usuario_telefone_ritex && (
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Phone className="h-3.5 w-3.5 text-emerald-600/60 shrink-0" />
                <span className="text-zinc-500">Ritex:</span>
                <span className="font-mono">{p.usuario_telefone_ritex}</span>
              </div>
            )}
            {p.usuario_email && (
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Mail className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <a href={`mailto:${p.usuario_email}`} className="hover:text-emerald-400 transition-colors truncate">
                  {p.usuario_email}
                </a>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 py-2 border-y border-white/5">
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-0.5">Criado em</p>
              <p className="text-xs text-zinc-400">{format(new Date(p.criado_em), 'dd/MM/yyyy', { locale: ptBR })}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-0.5">Atualizado</p>
              <p className="text-xs text-zinc-400">{format(new Date(p.atualizado_em), 'dd/MM/yyyy', { locale: ptBR })}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-0.5">Entrega solicitada</p>
              <p className="text-xs text-zinc-400">
                {p.data_entrega ? format(new Date(p.data_entrega + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-0.5">Prioridade</p>
              <p className="text-xs text-zinc-400">{p.prioridade ?? '—'}</p>
            </div>
            {p.orgao_vinculante && (
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-0.5">Órgão vinculante</p>
                <p className="text-xs text-zinc-400">{p.orgao_vinculante}</p>
              </div>
            )}
            {p.regiao_militar && (
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-0.5">C Mil A</p>
                <p className="text-xs text-zinc-400">{p.regiao_militar}</p>
              </div>
            )}
            {p.cgeo_id && (
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-0.5">CGEO</p>
                <p className="text-xs text-zinc-400">#{p.cgeo_id}</p>
              </div>
            )}
            {p.criador_nome && p.criador_nome !== p.usuario_nome && (
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-0.5">Criado por</p>
                <p className="text-xs text-zinc-400">{p.criador_nome}</p>
              </div>
            )}
          </div>

          {/* Itens — com BDGEx age colorido e impressão */}
          <div>
            <p className="text-xs font-medium text-zinc-500 mb-2 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Itens por prioridade
              <span className="ml-1 text-zinc-700 text-[10px]">
                Cor = idade do produto no BDGEx
                <span className="ml-1 text-emerald-400">{'<5a'}</span>
                <span className="mx-0.5 text-lime-400">{'<10a'}</span>
                <span className="mx-0.5 text-yellow-400">{'<20a'}</span>
                <span className="mx-0.5 text-orange-400">{'<30a'}</span>
                <span className="text-red-400">{'≥30a'}</span>
              </span>
            </p>
            <div className="space-y-1.5">
              {[...p.itens].sort((a, b) => a.prioridade - b.prioridade).map((item, idx) => {
                const age = calcAge(item.data_producao_bdgex)
                return (
                  <div key={item.id} className={`flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-zinc-400 border rounded-lg px-3 py-2 ${ageBgColor(age)}`}>
                    <span className="text-zinc-500 w-4 text-center shrink-0">{idx + 1}</span>
                    {item.mi
                      ? <span className="text-emerald-400 font-mono shrink-0 font-medium">{item.mi}</span>
                      : <span className="text-emerald-400 font-mono shrink-0 font-medium">{item.inom}</span>
                    }
                    {item.mi && <span className="text-zinc-500 font-mono shrink-0 text-[10px]">({item.inom})</span>}
                    <span className="shrink-0 text-zinc-300 font-medium">{TIPO_PRODUTO_LABELS[item.tipo_produto]}</span>
                    <span className="text-zinc-600 shrink-0">·</span>
                    <span className="shrink-0">{item.escala}</span>
                    {/* BDGEx indicator + age */}
                    {item.disponivel_bdgex ? (
                      <span className="flex items-center gap-1 shrink-0">
                        <span className="text-emerald-500 font-semibold">✓ BDGEx</span>
                        {age !== null && (
                          <span className={`font-bold ${ageColor(age)}`} title={`Publicação: ${item.data_producao_bdgex}`}>
                            {age}a
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-zinc-600 shrink-0 text-[10px]">Não no BDGEx</span>
                    )}
                    {/* Impressão */}
                    {item.impressao_quantidade && item.impressao_tipo_material ? (
                      <span className="flex items-center gap-1 text-violet-400 shrink-0 ml-auto">
                        <Printer className="h-3 w-3" />
                        <span className="font-medium">{item.impressao_quantidade}×</span>
                        <span>{item.impressao_tipo_material}</span>
                      </span>
                    ) : (
                      <span className="text-zinc-700 shrink-0 text-[10px] ml-auto">Sem impressão</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Impressão a nível de pedido */}
          {p.impressao_solicitada && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs bg-violet-500/10 border border-violet-500/20 text-violet-300 px-2.5 py-1 rounded-lg">
                <Printer className="h-3 w-3" />
                Impressão solicitada no pedido
                {p.impressao_quantidade && ` · ${p.impressao_quantidade} cópia${p.impressao_quantidade !== 1 ? 's' : ''}`}
                {p.impressao_tipo_material && ` · ${p.impressao_tipo_material}`}
              </span>
            </div>
          )}

          {/* Link BDGEx */}
          {p.link_bdgex && (
            <a
              href={p.link_bdgex}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Acessar no BDGEx
            </a>
          )}

          {/* Motivo reprovação */}
          {p.motivo_reprovacao && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
              <p className="text-xs text-red-400">
                <span className="font-semibold">Motivo reprovação: </span>
                {p.motivo_reprovacao}
              </p>
            </div>
          )}

          {/* Observações */}
          {p.observacoes && (
            <p className="text-xs text-zinc-400">
              <span className="font-medium text-zinc-300">Observações: </span>
              {p.observacoes}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Delete Confirm Inline ────────────────────────────────────────────────────
function DeleteConfirm({ onConfirm, onCancel, loading }: { onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/10 rounded-lg"><Trash2 className="h-5 w-5 text-red-400" /></div>
          <h2 className="text-base font-semibold text-zinc-100">Confirmar exclusão</h2>
          <button onClick={onCancel} className="ml-auto text-zinc-500 hover:text-zinc-300"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-zinc-400">Esta ação não pode ser desfeita. Deseja continuar?</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5">Cancelar</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-400 disabled:opacity-60">
            {loading ? 'Excluindo…' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function DSGDashboard() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [showBDGExAge, setShowBDGExAge] = useState(false)

  // Filters
  const [filterStatus, setFilterStatus] = useState('')
  const [filterOrgao, setFilterOrgao] = useState('')
  const [filterQ, setFilterQ] = useState('')

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Expanded / modals
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editingPedido, setEditingPedido] = useState<Pedido | null>(null)
  const [prontoTarget, setProntoTarget] = useState<Pedido | null>(null)

  const load = (params?: { status?: string; orgao_vinculante?: string; q?: string }) => {
    setLoading(true)
    pedidosApi.adminAll(params)
      .then((r) => {
        const data = (!params?.status)
          ? r.data.filter((p) => DSG_STATUSES.includes(p.status as typeof DSG_STATUSES[number]))
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

  const handleExport = async () => {
    setExporting(true)
    try {
      const ids = selected.size > 0 ? Array.from(selected) : pedidos.map(p => p.id)
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

  const handleDelete = async () => {
    if (!confirmDeleteId) return
    setDeleting(true)
    try {
      await pedidosApi.adminDelete(confirmDeleteId)
      toast.success(`Pedido #${confirmDeleteId} removido`)
      setPedidos(prev => prev.filter(p => p.id !== confirmDeleteId))
      setSelected(prev => { const s = new Set(prev); s.delete(confirmDeleteId); return s })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao remover pedido')
    } finally {
      setDeleting(false)
      setConfirmDeleteId(null)
    }
  }

  // Pagination
  const totalPages = Math.ceil(pedidos.length / PAGE_SIZE)
  const paginated = pedidos.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const allPageSelected = paginated.length > 0 && paginated.every(p => selected.has(p.id))
  const someSelected = selected.size > 0 && !allPageSelected

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelected(prev => { const s = new Set(prev); paginated.forEach(p => s.delete(p.id)); return s })
    } else {
      setSelected(prev => { const s = new Set(prev); paginated.forEach(p => s.add(p.id)); return s })
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {/* ── Header + filtros ── */}
      <div className="bg-zinc-900 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Pedidos DSG</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Pedidos que chegaram à DSG · {pedidos.length} exibidos
              {selected.size > 0 && <span className="ml-2 text-emerald-400">{selected.size} selecionado(s)</span>}
            </p>
          </div>

          <button
            onClick={() => setShowDuplicates(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            <Copy className="h-4 w-4" />
            Duplicatas
          </button>

          <button
            onClick={() => setShowBDGExAge(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            <CalendarClock className="h-4 w-4" />
            Recentes BDGEx
          </button>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 disabled:opacity-60 transition-colors"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? 'Baixando…' : selected.size > 0 ? `Baixar (${selected.size})` : 'Baixar pedidos'}
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Filter className="h-3.5 w-3.5" />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Etapa DSG (padrão)</option>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <select
            value={filterOrgao}
            onChange={e => setFilterOrgao(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Todos os órgãos</option>
            {ALL_ORGAOS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={filterQ}
              onChange={e => setFilterQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyFilters()}
              placeholder="Buscar por nome ou INOM…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={applyFilters}
            className="px-4 py-1.5 rounded-lg bg-zinc-700 border border-zinc-600 text-sm text-zinc-200 hover:bg-zinc-600 transition-colors"
          >
            Filtrar
          </button>
        </div>
      </div>

      {/* ── Duplicatas ── */}
      <DuplicatesPanel open={showDuplicates} onToggle={() => setShowDuplicates(v => !v)} />

      {/* ── Produtos Recentes BDGEx ── */}
      <BDGExAgePanel open={showBDGExAge} onToggle={() => setShowBDGExAge(v => !v)} />

      {/* ── Lista de pedidos ── */}
      {paginated.length === 0 ? (
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-12 text-center">
          <p className="text-zinc-500 text-sm">Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <>
          {/* Barra de seleção */}
          <div className="flex items-center gap-3 px-1">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <input
                type="checkbox"
                readOnly
                checked={allPageSelected}
                ref={el => { if (el) el.indeterminate = someSelected }}
                className="h-3.5 w-3.5 accent-emerald-500 pointer-events-none"
              />
              {allPageSelected ? 'Desmarcar página' : 'Selecionar página'}
            </button>
            <span className="text-xs text-zinc-600">
              {paginated.length} pedido(s) nesta página
            </span>
          </div>

          <div className="space-y-2">
            {paginated.map((p, idx) => (
              <PedidoDSGCard
                key={p.id}
                pedido={p}
                rank={page * PAGE_SIZE + idx + 1}
                isExpanded={expandedId === p.id}
                isSelected={selected.has(p.id)}
                onToggleSelect={(id) => {
                  setSelected(prev => {
                    const s = new Set(prev)
                    if (s.has(id)) s.delete(id); else s.add(id)
                    return s
                  })
                }}
                onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                onPronto={setProntoTarget}
                onEdit={setEditingPedido}
                onDelete={setConfirmDeleteId}
              />
            ))}
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-zinc-500">
                Página {page + 1} de {totalPages} · {pedidos.length} pedidos
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 rounded-lg text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 rounded-lg text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modais ── */}
      {editingPedido && (
        <EditModal
          pedido={editingPedido}
          onClose={() => setEditingPedido(null)}
          onSaved={(updated) => setPedidos(prev => prev.map(p => p.id === updated.id ? updated : p))}
        />
      )}
      {prontoTarget && (
        <ProntoModal
          pedido={prontoTarget}
          onClose={() => setProntoTarget(null)}
          onDone={(updated) => setPedidos(prev => prev.map(p => p.id === updated.id ? updated : p))}
        />
      )}
      {confirmDeleteId !== null && (
        <DeleteConfirm
          onConfirm={handleDelete}
          onCancel={() => setConfirmDeleteId(null)}
          loading={deleting}
        />
      )}
    </div>
  )
}
