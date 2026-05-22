import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Send, Map, ChevronDown, ChevronUp, GripVertical, AlertTriangle,
  X, Copy, Trash2, Ban, Phone, Mail, Building2, Briefcase,
  Clock, CalendarX, CheckCircle, Info, Download, Loader2,
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { pedidosApi, type DuplicateItem } from '../../api/pedidos'
import { janelasApi, type MinhaJanela } from '../../api/janelas'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { PedidosMap } from '../../components/map/PedidosMap'
import type { Pedido } from '../../types/pedido'
import { TIPO_PRODUTO_LABELS } from '../../types/pedido'
import { useAuthStore } from '../../store/authStore'
import { useExportRelatorio } from '../../hooks/useExportRelatorio'

const CONSOLIDATE_LABELS: Record<string, string> = {
  // Supervisores regionais encaminham para COTER
  SUPERVISOR_CMP:  'Encaminhar ao COTER',
  SUPERVISOR_CML:  'Encaminhar ao COTER',
  SUPERVISOR_CMS:  'Encaminhar ao COTER',
  SUPERVISOR_CMO:  'Encaminhar ao COTER',
  SUPERVISOR_CMAO: 'Encaminhar ao COTER',
  SUPERVISOR_CMA:  'Encaminhar ao COTER',
  SUPERVISOR_CMNE: 'Encaminhar ao COTER',
  SUPERVISOR_CMSE: 'Encaminhar ao COTER',
  SUPERVISOR:      'Encaminhar ao COTER',
  // Consolidadores encaminham para DSG
  CONSOLIDADOR_COTER:  'Enviar à DSG',
  CONSOLIDADOR_DSG:    'Enviar à DSG',
  CONSOLIDADOR_DEC:    'Enviar à DSG',
  CONSOLIDADOR_COLOG:  'Enviar à DSG',
  CONSOLIDADOR_DECEX:  'Enviar à DSG',
  CONSOLIDADOR:        'Enviar à DSG',
}

const PERFIL_LABELS: Record<string, string> = {
  SOLICITANTE:         'OMDS',
  SUPERVISOR_CMP:      'Supervisor CMP',
  SUPERVISOR_CML:      'Supervisor CML',
  SUPERVISOR_CMS:      'Supervisor CMS',
  SUPERVISOR_CMO:      'Supervisor CMO',
  SUPERVISOR_CMAO:     'Supervisor CMAO',
  SUPERVISOR_CMA:      'Supervisor CMA',
  SUPERVISOR_CMNE:     'Supervisor CMNE',
  SUPERVISOR_CMSE:     'Supervisor CMSE',
  SUPERVISOR:          'Supervisor',
  CONSOLIDADOR_COTER:  'Consolidador COTER',
  CONSOLIDADOR_DSG:    'Consolidador DSG',
  CONSOLIDADOR_DEC:    'Consolidador DEC',
  CONSOLIDADOR_COLOG:  'Consolidador COLOG',
  CONSOLIDADOR_DECEX:  'Consolidador DECEx',
  CONSOLIDADOR:        'Consolidador',
  GESTOR_CARTOGRAFICO: 'DSG',
  ANALISTA_CGEO:       'CGEO',
}

// ─── Janela Banner ────────────────────────────────────────────────────────────
function JanelaBanner({ janela, perfil }: { janela: MinhaJanela | null; perfil: string }) {
  if (!janela) return null
  if (!janela.configurada) {
    return (
      <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
        <span className="text-amber-300">
          Janela de ação não configurada pelo administrador. Contate o Gestor Cartográfico (DSG).
        </span>
      </div>
    )
  }
  if (janela.aberta) {
    return (
      <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm">
        <Clock className="h-4 w-4 text-emerald-400 shrink-0" />
        <span className="text-emerald-300">
          Janela aberta · encerra em{' '}
          {janela.data_fim
            ? format(new Date(janela.data_fim), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
            : '—'}
          {janela.dias_restantes !== null && (
            <span className="ml-2 font-semibold">({janela.dias_restantes} dia(s) restante(s))</span>
          )}
        </span>
      </div>
    )
  }
  const futura = janela.data_inicio && new Date(janela.data_inicio) > new Date()
  return (
    <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm">
      <CalendarX className="h-4 w-4 text-red-400 shrink-0" />
      <span className="text-red-300">
        {futura
          ? `Janela ainda não iniciada. Início em ${format(new Date(janela.data_inicio!), 'dd/MM/yyyy', { locale: ptBR })}`
          : `Janela encerrada em ${janela.data_fim ? format(new Date(janela.data_fim), 'dd/MM/yyyy', { locale: ptBR }) : '—'}. Ações bloqueadas.`}
      </span>
    </div>
  )
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel: string
  confirmClass?: string
  onConfirm: (motivo?: string) => void
  onCancel: () => void
  requireMotivo?: boolean
}

function ConfirmModal({ title, message, confirmLabel, confirmClass, onConfirm, onCancel, requireMotivo }: ConfirmModalProps) {
  const [motivo, setMotivo] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center gap-3 p-5 border-b border-white/10">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
          <button onClick={onCancel} className="ml-auto text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-zinc-400 leading-relaxed">{message}</p>
          {requireMotivo && (
            <div>
              <label className="text-xs font-medium text-zinc-400 block mb-1">Motivo <span className="text-red-400">*</span></label>
              <textarea
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Descreva o motivo..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
              />
            </div>
          )}
        </div>
        <div className="flex gap-2 p-5 pt-0">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => { if (requireMotivo && !motivo.trim()) { toast.error('Informe o motivo'); return } onConfirm(motivo || undefined) }}
            className={`flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${confirmClass ?? 'bg-emerald-500 hover:bg-emerald-400'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Item Confirm ───────────────────────────────────────────────────────
interface DeleteItemModalProps {
  pedidoId: number
  item: { id: number; inom: string; tipo_produto: string; escala: string }
  onConfirm: () => void
  onCancel: () => void
}

function DeleteItemModal({ pedidoId, item, onConfirm, onCancel }: DeleteItemModalProps) {
  return (
    <ConfirmModal
      title="Remover item do pedido"
      message={`Você está prestes a remover o item abaixo do pedido #${pedidoId}:\n\n• INOM: ${item.inom}\n• Produto: ${TIPO_PRODUTO_LABELS[item.tipo_produto as keyof typeof TIPO_PRODUTO_LABELS] ?? item.tipo_produto}\n• Escala: ${item.escala}\n\nEsta ação não pode ser desfeita.`}
      confirmLabel="Remover item"
      confirmClass="bg-red-500 hover:bg-red-400"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

// ─── Duplicate Warning Modal ───────────────────────────────────────────────────
interface DuplicateModalProps {
  duplicates: DuplicateItem[]
  selectedCount: number
  onConfirm: () => void
  onCancel: () => void
}

function DuplicateModal({ duplicates, selectedCount, onConfirm, onCancel }: DuplicateModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center gap-3 p-6 border-b border-white/10">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Pedidos Duplicados Detectados</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Existem itens com mesma articulação, produto e escala em pedidos diferentes.</p>
          </div>
          <button onClick={onCancel} className="ml-auto text-zinc-500 hover:text-zinc-300">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-3 max-h-72 overflow-y-auto">
          {duplicates.map((dup, idx) => (
            <div key={idx} className="bg-zinc-800/60 border border-zinc-700/40 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Copy className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="text-xs font-medium text-zinc-200">
                  <span className="text-emerald-400 font-mono">{dup.inom}</span>
                  <span className="text-zinc-500 mx-1">·</span>
                  {TIPO_PRODUTO_LABELS[dup.tipo_produto as keyof typeof TIPO_PRODUTO_LABELS] ?? dup.tipo_produto}
                  <span className="text-zinc-500 mx-1">·</span>
                  {dup.escala}
                </span>
              </div>
              <div className="space-y-1">
                {dup.pedidos.map(p => (
                  <div key={p.id} className="flex items-center gap-2 text-xs text-zinc-400 pl-5">
                    <span className="text-emerald-400 font-semibold">#{p.id}</span>
                    <span>{p.usuario_nome ?? '—'}</span>
                    <StatusBadge status={p.status as any} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="p-6 pt-0 space-y-2">
          <p className="text-xs text-zinc-400 leading-relaxed">
            Os pedidos duplicados serão encaminhados com uma marcação de duplicata. O escalão seguinte receberá todos os pedidos e decidirá como proceder.
          </p>
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-colors">
              Revisar pedidos
            </button>
            <button onClick={onConfirm} className="flex-1 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-400 transition-colors">
              Encaminhar mesmo assim ({selectedCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Expanded Row ──────────────────────────────────────────────────────────────
interface ExpandedRowProps {
  pedido: Pedido
  janelaAberta: boolean
  colSpan: number
}

function ExpandedRow({ pedido: p, janelaAberta, colSpan }: ExpandedRowProps) {
  const [deletingItem, setDeletingItem] = useState<{ id: number; inom: string; tipo_produto: string; escala: string } | null>(null)

  const handleDeleteItem = async () => {
    if (!deletingItem) return
    try {
      await pedidosApi.deleteItem(p.id, deletingItem.id)
      toast.success(`Item ${deletingItem.inom} removido`)
      setDeletingItem(null)
      window.dispatchEvent(new CustomEvent('gestor-reload'))
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao remover item')
      setDeletingItem(null)
    }
  }

  return (
    <>
      <tr className="bg-zinc-800/40">
        <td colSpan={colSpan} className="px-6 py-4">
          <div className="space-y-4">
            {/* Operação + Finalidade/Justificativa */}
            {(p.operacao_nome || p.finalidade) && (
              <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                {p.operacao_nome && (
                  <div className="flex items-center gap-2 text-xs">
                    <Briefcase className="h-3.5 w-3.5 text-emerald-500/80 shrink-0" />
                    <span className="font-semibold text-zinc-200">{p.operacao_nome}</span>
                  </div>
                )}
                {p.finalidade && (
                  <p className="text-xs text-zinc-400">
                    <span className="font-medium text-zinc-300">
                      {p.operacao_nome ? 'Finalidade:' : 'Justificativa:'}
                    </span>{' '}
                    {p.finalidade}
                  </p>
                )}
              </div>
            )}

            {/* Contato completo (telefone + ritex + email + seção) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {p.usuario_om && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Building2 className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  <span>{p.usuario_om}</span>
                </div>
              )}
              {p.usuario_secao_om && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Info className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  <span>{p.usuario_secao_om}</span>
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
                  <a href={`mailto:${p.usuario_email}`} className="hover:text-emerald-400 transition-colors">{p.usuario_email}</a>
                </div>
              )}
            </div>

            {p.motivo_reprovacao && (
              <p className="text-xs text-red-400">
                <span className="font-medium">Motivo reprovação:</span> {p.motivo_reprovacao}
              </p>
            )}

            {/* Items list with delete */}
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-2">
                Itens por prioridade
                {janelaAberta && (
                  <span className="ml-2 text-zinc-600">(clique no 🗑 para remover um item)</span>
                )}
              </p>
              <div className="space-y-1.5">
                {[...p.itens].sort((a, b) => a.prioridade - b.prioridade).map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2 text-xs text-zinc-400 group">
                    <span className="text-zinc-600 w-4 text-center shrink-0">{idx + 1}</span>
                    <span className="text-emerald-400 font-mono shrink-0">{item.inom}</span>
                    {item.mi && <span className="text-zinc-500 font-mono shrink-0">MI: {item.mi}</span>}
                    <span className="shrink-0">{TIPO_PRODUTO_LABELS[item.tipo_produto]}</span>
                    <span className="text-zinc-600 shrink-0">·</span>
                    <span className="shrink-0">{item.escala}</span>
                    {janelaAberta && p.itens.length > 1 && (
                      <button
                        onClick={() => setDeletingItem({ id: item.id, inom: item.inom, tipo_produto: item.tipo_produto, escala: item.escala })}
                        className="ml-auto opacity-0 group-hover:opacity-100 p-1 rounded text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="Remover este item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </td>
      </tr>

      {deletingItem && (
        <DeleteItemModal
          pedidoId={p.id}
          item={deletingItem}
          onConfirm={handleDeleteItem}
          onCancel={() => setDeletingItem(null)}
        />
      )}
    </>
  )
}

// ─── Sortable Row ──────────────────────────────────────────────────────────────
interface SortableRowProps {
  pedido: Pedido
  expandedRow: number | null
  setExpandedRow: (id: number | null) => void
  onEncaminhar: (id: number) => void
  onReprovar: (id: number) => void
  janelaAberta: boolean
  colSpan: number
  selected: boolean
  onToggleSelect: (id: number) => void
}

function SortableRow({
  pedido: p,
  expandedRow,
  setExpandedRow,
  onEncaminhar,
  onReprovar,
  janelaAberta,
  colSpan,
  selected,
  onToggleSelect,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const isExpanded = expandedRow === p.id

  const tipoProdutos = [...new Set(p.itens.map((i) => TIPO_PRODUTO_LABELS[i.tipo_produto]))].join(', ')
  const perfilLabel = PERFIL_LABELS[p.usuario_perfil ?? ''] ?? p.usuario_perfil ?? '—'

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        className={`transition-colors ${selected ? 'bg-emerald-500/5' : isExpanded ? 'bg-zinc-800/30' : 'hover:bg-white/5'}`}
      >
        {/* Checkbox */}
        <td className="px-3 py-3 w-8">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(p.id)}
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 focus:ring-1 cursor-pointer accent-emerald-500"
          />
        </td>

        {/* Drag handle */}
        <td className="px-3 py-3 w-8">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing touch-none"
            title="Arrastar para reordenar"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </td>

        {/* ID */}
        <td className="px-3 py-3 w-20">
          <span className="font-mono font-semibold text-emerald-400 text-sm">#{p.id}</span>
        </td>

        {/* Solicitante (nome + OM destacado + perfil) */}
        <td className="px-3 py-3">
          <div className="space-y-1">
            <p className="text-sm text-zinc-100 font-semibold leading-tight">{p.usuario_nome ?? '—'}</p>
            {p.usuario_om && (
              <p className="text-xs text-zinc-300 font-medium leading-tight">{p.usuario_om}</p>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              {p.usuario_perfil && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-400 border border-zinc-600/30">
                  {perfilLabel}
                </span>
              )}
              {p.criador_nome && p.criador_nome !== p.usuario_nome && (
                <span className="text-[10px] text-amber-400/80">herdado de {p.criador_nome}</span>
              )}
            </div>
          </div>
        </td>

        {/* Operação */}
        <td className="px-3 py-3 max-w-[170px]">
          {p.operacao_nome ? (
            <div className="flex items-start gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-emerald-500/70 shrink-0 mt-0.5" />
              <span className="text-xs text-zinc-200 font-medium line-clamp-2 leading-snug" title={p.operacao_nome}>
                {p.operacao_nome}
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-zinc-600 italic">
              {p.finalidade ? 'ver justificativa ↓' : '—'}
            </span>
          )}
        </td>

        {/* Email */}
        <td className="px-3 py-3">
          {p.usuario_email ? (
            <a
              href={`mailto:${p.usuario_email}`}
              className="text-xs text-zinc-400 hover:text-emerald-400 flex items-center gap-1 transition-colors"
            >
              <Mail className="h-3 w-3 text-zinc-600 shrink-0" />
              <span className="truncate max-w-[140px]">{p.usuario_email}</span>
            </a>
          ) : <span className="text-zinc-600 text-xs">—</span>}
        </td>

        {/* Produtos */}
        <td className="px-3 py-3">
          <p className="text-xs text-zinc-300">{tipoProdutos}</p>
          <p className="text-[10px] text-zinc-500">{p.itens.length} item(ns)</p>
        </td>

        {/* Status */}
        <td className="px-3 py-3">
          <StatusBadge status={p.status} />
        </td>

        {/* Ações */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-1">
            {/* Expand/detalhar */}
            <button
              onClick={() => setExpandedRow(isExpanded ? null : p.id)}
              className={`p-1.5 rounded-md transition-colors ${isExpanded ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
              title={isExpanded ? 'Fechar detalhes' : 'Ver detalhes e editar itens'}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {/* Reprovar / Cancelar */}
            <button
              disabled={!janelaAberta}
              onClick={() => onReprovar(p.id)}
              className="p-1.5 rounded-md text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={janelaAberta ? 'Reprovar/cancelar pedido' : 'Janela fechada'}
            >
              <Ban className="h-4 w-4" />
            </button>

            {/* Encaminhar (individual) */}
            <button
              disabled={!janelaAberta}
              onClick={() => onEncaminhar(p.id)}
              className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={janelaAberta ? 'Encaminhar este pedido' : 'Janela fechada'}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <ExpandedRow pedido={p} janelaAberta={janelaAberta} colSpan={colSpan} />
      )}
    </>
  )
}

// ─── Pending Action State ──────────────────────────────────────────────────────
type PendingAction =
  | { type: 'encaminhar'; id: number }
  | { type: 'encaminhar-lote'; ids: number[] }
  | { type: 'reprovar'; id: number }
  | { type: 'reprovar-lote'; ids: number[] }
  | null

// ─── Main Component ───────────────────────────────────────────────────────────
export function GestorDashboard() {
  const user = useAuthStore((s) => s.user)
  const perfil = user?.perfil ?? ''
  const consolidateLabel = CONSOLIDATE_LABELS[perfil] ?? 'Encaminhar'

  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [janela, setJanela] = useState<MinhaJanela | null>(null)
  const [showMap, setShowMap] = useState(false)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [duplicateModal, setDuplicateModal] = useState<{ dups: DuplicateItem[]; ids: number[] } | null>(null)
  const [processing, setProcessing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const { exportando, baixarRelatorio } = useExportRelatorio()

  const sensors = useSensors(useSensor(PointerSensor))

  const janelaAberta = janela?.aberta ?? false

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      pedidosApi.listPending(),
      janelasApi.minhaJanela(),
    ])
      .then(([pr, jr]) => {
        const sorted = [...pr.data].sort((a, b) => a.prioridade - b.prioridade)
        setPedidos(sorted)
        setJanela(jr.data)
        setSelectedIds(new Set()) // limpa seleção ao recarregar
      })
      .catch(() => toast.error('Erro ao carregar pedidos'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    const handler = () => load()
    window.addEventListener('gestor-reload', handler)
    return () => window.removeEventListener('gestor-reload', handler)
  }, [load])

  // ── Seleção ──────────────────────────────────────────────────────────────────
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === pedidos.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pedidos.map(p => p.id)))
    }
  }

  // ── Encaminhar ──────────────────────────────────────────────────────────────
  const executeEncaminhar = async (ids: number[]) => {
    setProcessing(true)
    setDuplicateModal(null)
    setPendingAction(null)
    try {
      const r = await pedidosApi.consolidate(ids)
      const submetidos = (r.data as { submetidos: number }).submetidos
      toast.success(`${submetidos} pedido(s) enviado(s)`)
      load()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao encaminhar')
    } finally {
      setProcessing(false)
    }
  }

  const handleEncaminharComDuplicatas = async (ids: number[]) => {
    try {
      const res = await pedidosApi.getDuplicatas()
      const dups = res.data.filter(d => d.pedidos.some(p => ids.includes(p.id)))
      if (dups.length > 0) {
        setDuplicateModal({ dups, ids })
        return
      }
    } catch { /* ignore */ }
    await executeEncaminhar(ids)
  }

  const handleEncaminharLote = async () => {
    const ids = selectedIds.size > 0
      ? [...selectedIds]
      : pedidos.map(p => p.id)
    if (ids.length === 0) { toast.error('Nenhum pedido na fila'); return }
    setPendingAction({ type: 'encaminhar-lote', ids })
  }

  const handleEncaminharIndividual = (id: number) => {
    setPendingAction({ type: 'encaminhar', id })
  }

  const confirmEncaminhar = async () => {
    if (!pendingAction || (pendingAction.type !== 'encaminhar' && pendingAction.type !== 'encaminhar-lote')) return
    const ids = pendingAction.type === 'encaminhar' ? [pendingAction.id] : pendingAction.ids
    setPendingAction(null)
    await handleEncaminharComDuplicatas(ids)
  }

  // ── Reprovar ────────────────────────────────────────────────────────────────
  const confirmReprovar = async (motivo?: string) => {
    if (!pendingAction || pendingAction.type !== 'reprovar') return
    const id = pendingAction.id
    setPendingAction(null)
    setProcessing(true)
    try {
      await pedidosApi.review(id, 'reprovar', motivo)
      toast.success('Pedido cancelado')
      load()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao cancelar pedido')
    } finally {
      setProcessing(false)
    }
  }

  const confirmReprovarLote = async (motivo?: string) => {
    if (!pendingAction || pendingAction.type !== 'reprovar-lote') return
    const ids = pendingAction.ids
    setPendingAction(null)
    setProcessing(true)
    let ok = 0, fail = 0
    for (const id of ids) {
      try {
        await pedidosApi.review(id, 'reprovar', motivo)
        ok++
      } catch { fail++ }
    }
    if (ok > 0) toast.success(`${ok} pedido(s) cancelado(s)`)
    if (fail > 0) toast.error(`${fail} pedido(s) não puderam ser cancelados`)
    setProcessing(false)
    load()
  }

  // ── Drag reorder ─────────────────────────────────────────────────────────────
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = pedidos.findIndex(p => p.id === active.id)
    const newIdx = pedidos.findIndex(p => p.id === over.id)
    const reordered = arrayMove(pedidos, oldIdx, newIdx)
    setPedidos(reordered)
    try {
      await pedidosApi.reorderPedidos(reordered.map(p => p.id))
    } catch {
      toast.error('Erro ao salvar ordem')
      load()
    }
  }, [pedidos, load])

  if (loading) return <LoadingSpinner />

  const COL_COUNT = 9 // checkbox + drag + id + solicitante + telefone + email + produtos + status + ações
  const allSelected = pedidos.length > 0 && selectedIds.size === pedidos.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < pedidos.length
  const selCount = selectedIds.size

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Pedidos Pendentes</h1>
          {pedidos.length > 0 && (
            <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1.5">
              <GripVertical className="h-3.5 w-3.5" />
              Arraste linhas para reordenar por prioridade
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowMap(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showMap ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'}`}
          >
            <Map className="h-4 w-4" />
            {showMap ? 'Fechar mapa' : 'Ver no mapa'}
          </button>

          {/* Exportar relatório */}
          {pedidos.length > 0 && (
            <button
              onClick={baixarRelatorio}
              disabled={exportando}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Baixar pedidos em ZIP (CSV + GeoJSON por escala + LEIA-ME)"
            >
              {exportando
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />}
              Baixar pedidos
            </button>
          )}

          {/* Botão remover selecionados — visível apenas quando há seleção */}
          {selCount > 0 && (
            <button
              onClick={() => setPendingAction({ type: 'reprovar-lote', ids: [...selectedIds] })}
              disabled={!janelaAberta || processing}
              className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-red-500/20 transition-colors"
            >
              <Ban className="h-4 w-4" />
              Remover selecionados ({selCount})
            </button>
          )}

          {/* Botão encaminhar */}
          <button
            onClick={handleEncaminharLote}
            disabled={pedidos.length === 0 || !janelaAberta || processing}
            className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-emerald-400 transition-colors"
          >
            <Send className="h-4 w-4" />
            {processing
              ? 'Processando...'
              : selCount > 0
                ? `${consolidateLabel} (${selCount} selecionados)`
                : `${consolidateLabel} (todos ${pedidos.length})`}
          </button>
        </div>
      </div>

      {/* Janela status banner */}
      <JanelaBanner janela={janela} perfil={perfil} />

      {showMap && (
        <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden" style={{ height: '380px' }}>
          <PedidosMap className="w-full h-full" />
        </div>
      )}

      {pedidos.length === 0 ? (
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-12 text-center">
          <CheckCircle className="h-10 w-10 text-emerald-500/40 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Nenhum pedido aguardando revisão.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[960px]">
                <thead className="border-b border-white/10 bg-zinc-800/50">
                  <tr>
                    {/* Checkbox "selecionar todos" */}
                    <th className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected }}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 focus:ring-1 cursor-pointer accent-emerald-500"
                        title={allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                      />
                    </th>
                    <th className="px-3 py-3 w-8"></th>
                    <th className="px-3 py-3 text-left font-medium text-zinc-400 w-20">Pedido</th>
                    <th className="px-3 py-3 text-left font-medium text-zinc-400">Solicitante / OM</th>
                    <th className="px-3 py-3 text-left font-medium text-zinc-400">Operação</th>
                    <th className="px-3 py-3 text-left font-medium text-zinc-400">E-mail</th>
                    <th className="px-3 py-3 text-left font-medium text-zinc-400">Produtos</th>
                    <th className="px-3 py-3 text-left font-medium text-zinc-400">Status</th>
                    <th className="px-3 py-3 text-left font-medium text-zinc-400">Ações</th>
                  </tr>
                </thead>
                <SortableContext items={pedidos.map(p => p.id)} strategy={verticalListSortingStrategy}>
                  <tbody className="divide-y divide-white/5">
                    {pedidos.map(p => (
                      <SortableRow
                        key={p.id}
                        pedido={p}
                        expandedRow={expandedRow}
                        setExpandedRow={setExpandedRow}
                        onEncaminhar={handleEncaminharIndividual}
                        onReprovar={(id) => setPendingAction({ type: 'reprovar', id })}
                        janelaAberta={janelaAberta}
                        colSpan={COL_COUNT}
                        selected={selectedIds.has(p.id)}
                        onToggleSelect={toggleSelect}
                      />
                    ))}
                  </tbody>
                </SortableContext>
              </table>
            </div>
          </DndContext>
        </div>
      )}

      {/* ── Confirm modals ── */}

      {/* Encaminhar lote */}
      {pendingAction?.type === 'encaminhar-lote' && (
        <ConfirmModal
          title={consolidateLabel}
          message={`Você está prestes a encaminhar ${pendingAction.ids.length} pedido(s) para o próximo escalão. Esta ação não pode ser desfeita.`}
          confirmLabel="Encaminhar"
          confirmClass="bg-emerald-500 hover:bg-emerald-400"
          onConfirm={confirmEncaminhar}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {/* Encaminhar individual */}
      {pendingAction?.type === 'encaminhar' && (() => {
        const p = pedidos.find(x => x.id === (pendingAction as { type: 'encaminhar'; id: number }).id)
        return (
          <ConfirmModal
            title="Encaminhar pedido"
            message={`Você está prestes a encaminhar o Pedido #${p?.id ?? ''} de ${p?.usuario_nome ?? '—'} (${p?.usuario_om ?? '—'}) para o próximo escalão.`}
            confirmLabel="Encaminhar"
            confirmClass="bg-emerald-500 hover:bg-emerald-400"
            onConfirm={confirmEncaminhar}
            onCancel={() => setPendingAction(null)}
          />
        )
      })()}

      {/* Reprovar individual */}
      {pendingAction?.type === 'reprovar' && (() => {
        const p = pedidos.find(x => x.id === (pendingAction as { type: 'reprovar'; id: number }).id)
        return (
          <ConfirmModal
            title="Cancelar pedido"
            message={`Você está prestes a CANCELAR o Pedido #${p?.id ?? ''} de ${p?.usuario_nome ?? '—'} (${p?.usuario_om ?? '—'}). Esta ação não pode ser desfeita.`}
            confirmLabel="Cancelar pedido"
            confirmClass="bg-red-500 hover:bg-red-400"
            requireMotivo
            onConfirm={confirmReprovar}
            onCancel={() => setPendingAction(null)}
          />
        )
      })()}

      {/* Reprovar em lote */}
      {pendingAction?.type === 'reprovar-lote' && (
        <ConfirmModal
          title="Cancelar pedidos selecionados"
          message={`Você está prestes a CANCELAR ${(pendingAction as { type: 'reprovar-lote'; ids: number[] }).ids.length} pedido(s) selecionados. Esta ação não pode ser desfeita.`}
          confirmLabel="Cancelar selecionados"
          confirmClass="bg-red-500 hover:bg-red-400"
          requireMotivo
          onConfirm={confirmReprovarLote}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {/* Duplicates warning */}
      {duplicateModal && (
        <DuplicateModal
          duplicates={duplicateModal.dups}
          selectedCount={duplicateModal.ids.length}
          onConfirm={() => executeEncaminhar(duplicateModal.ids)}
          onCancel={() => setDuplicateModal(null)}
        />
      )}
    </div>
  )
}
