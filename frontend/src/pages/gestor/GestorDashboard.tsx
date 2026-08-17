import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Send, Map, ChevronDown, ChevronUp, GripVertical, AlertTriangle,
  X, Copy, Trash2, Ban, Phone, Mail, Building2, Briefcase,
  Clock, CalendarX, CheckCircle, Info, Download, Loader2,
  CalendarClock, User, Printer, ExternalLink, FileText, MapPin, Search,
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { pedidosApi, type DuplicateItem } from '../../api/pedidos'
import { formatNomeComPosto } from '../../data/postos'
import { janelasApi, type MinhaJanela } from '../../api/janelas'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { PedidosMap } from '../../components/map/PedidosMap'
import { PedidoSpatializeModal } from '../../components/map/PedidoSpatializeModal'
import { DuplicateItemsModal } from '../../components/shared/DuplicateItemsModal'
import type { Pedido } from '../../types/pedido'
import { TIPO_PRODUTO_LABELS, porPrioridade } from '../../types/pedido'
import { CMILA_CODES, cmilaLabel } from '../../types/user'
import { casaBusca } from '../../utils/busca'
import { useAuthStore } from '../../store/authStore'
import { useExportRelatorio } from '../../hooks/useExportRelatorio'

const CONSOLIDATE_LABELS: Record<string, string> = {
  SUPERVISOR_CMP:  'Encaminhar ao COTER',
  SUPERVISOR_CML:  'Encaminhar ao COTER',
  SUPERVISOR_CMS:  'Encaminhar ao COTER',
  SUPERVISOR_CMO:  'Encaminhar ao COTER',
  SUPERVISOR_CMAO: 'Encaminhar ao COTER',
  SUPERVISOR_CMA:  'Encaminhar ao COTER',
  SUPERVISOR_CMNE: 'Encaminhar ao COTER',
  SUPERVISOR_CMSE: 'Encaminhar ao COTER',
  SUPERVISOR:      'Encaminhar ao COTER',
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

/** Cores por órgão vinculante — usadas nos chips de subordinação. */
const ORG_CLS: Record<string, string> = {
  COTER: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  DEC:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  COLOG: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  DECEx: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  DSG:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

const itemAtivo = (item: { removido?: boolean }) => !item.removido
const itensAtivos = (pedido: Pedido) => pedido.itens.filter(itemAtivo)
const itensRemovidos = (pedido: Pedido) => pedido.itens.filter(i => i.removido)

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

// ─── Duplicate Warning Modal ──────────────────────────────────────────────────
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
                    <StatusBadge status={p.status as Parameters<typeof StatusBadge>[0]['status']} />
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

// ─── Pedido Card ──────────────────────────────────────────────────────────────
interface PedidoCardProps {
  pedido: Pedido
  rank: number
  isExpanded: boolean
  janelaAberta: boolean
  selected: boolean
  onToggleSelect: (id: number) => void
  onToggleExpand: (id: number) => void
  onEncaminhar: (id: number) => void
  onReprovar: (id: number) => void
  onSpatialize: (pedido: Pedido) => void
  onReload: () => void
}

function PedidoCard({
  pedido: p,
  rank,
  isExpanded,
  janelaAberta,
  selected,
  onToggleSelect,
  onToggleExpand,
  onEncaminhar,
  onReprovar,
  onSpatialize,
  onReload,
}: PedidoCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  const [deletingItem, setDeletingItem] = useState<{ id: number; inom: string; tipo_produto: string; escala: string } | null>(null)

  const handleDeleteItem = async () => {
    if (!deletingItem) return
    try {
      await pedidosApi.deleteItem(p.id, deletingItem.id)
      toast.success(`Item ${deletingItem.inom} marcado como removido`)
      setDeletingItem(null)
      onReload()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao remover item')
      setDeletingItem(null)
    }
  }

  const ativos = itensAtivos(p)
  const removidos = itensRemovidos(p)
  const tipos = [...new Set(ativos.map(i => TIPO_PRODUTO_LABELS[i.tipo_produto]))].join(' · ') || '—'
  const temImpressao = p.impressao_solicitada || ativos.some(i => i.impressao_quantidade)

  const descricao = p.finalidade_geo
    ? p.finalidade_geo
    : p.operacao_nome
      ? p.operacao_nome
      : p.finalidade
        ? (p.finalidade.length > 60 ? p.finalidade.substring(0, 60) + '…' : p.finalidade)
        : null

  const dataEntregaFmt = p.data_entrega
    ? format(new Date(p.data_entrega + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })
    : null

  // Posto (abreviado) + Nome de guerra (ou nome completo se não houver NG)
  const nomeDisplay = formatNomeComPosto(
    p.usuario_nome ?? '',
    p.usuario_posto_graduacao,
    p.usuario_nome_de_guerra,
  ) || '—'

  return (
    <div ref={setNodeRef} style={style} className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
      {/* ── Summary row ── */}
      <div className="flex items-center gap-1.5 px-3 py-3">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(p.id)}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 focus:ring-1 cursor-pointer accent-emerald-500 shrink-0"
        />

        {/* Drag handle + rank */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex items-center gap-1 text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing touch-none shrink-0"
          title="Arrastar para reordenar prioridade"
        >
          <GripVertical className="h-4 w-4" />
          <span className="text-[10px] font-bold w-3 text-center">{rank}</span>
        </button>

        {/* ID */}
        <span className="font-mono font-semibold text-emerald-400 text-sm shrink-0">#{p.id}</span>

        {/* Main content — clicável para expandir */}
        <button
          type="button"
          onClick={() => onToggleExpand(p.id)}
          className="flex-1 min-w-0 text-left"
        >
          {/* Solicitante — posto + NG + OM + subordinação */}
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="text-sm font-semibold text-zinc-100 leading-tight truncate">{nomeDisplay}</span>
            {p.usuario_om && (
              <span className="text-xs text-zinc-500 truncate">{p.usuario_om}</span>
            )}
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
          {/* Finalidade / operação */}
          {descricao && (
            <p className="text-xs text-zinc-500 mt-0.5 truncate leading-snug">{descricao}</p>
          )}
          {/* Produtos + itens + impressão */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[11px] text-zinc-500">{tipos}</span>
            <span className="text-zinc-700">·</span>
            <span className="text-[11px] text-zinc-600">{ativos.length} ativo(s)</span>
            {removidos.length > 0 && (
              <span className="text-[11px] text-red-400/70">{removidos.length} removido(s)</span>
            )}
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
            title={isExpanded ? 'Fechar detalhes' : 'Ver detalhes'}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            disabled={!janelaAberta}
            onClick={() => onReprovar(p.id)}
            className="p-1.5 rounded-md text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={janelaAberta ? 'Cancelar pedido' : 'Janela fechada'}
          >
            <Ban className="h-4 w-4" />
          </button>
          <button
            disabled={!janelaAberta}
            onClick={() => onEncaminhar(p.id)}
            className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={janelaAberta ? 'Encaminhar pedido' : 'Janela fechada'}
          >
            <Send className="h-4 w-4" />
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

          {/* Contato */}
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
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-0.5">Entrega solicitada</p>
              <p className="text-xs text-zinc-400">{p.data_entrega ? format(new Date(p.data_entrega + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</p>
            </div>
            {p.orgao_vinculante && (
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-0.5">Órgão</p>
                <p className="text-xs text-zinc-400">{p.orgao_vinculante}</p>
              </div>
            )}
            {p.regiao_militar && (
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-0.5">C Mil A</p>
                <p className="text-xs text-zinc-400">{p.regiao_militar}</p>
              </div>
            )}
          </div>

          {/* Itens */}
          <div>
            <p className="text-xs font-medium text-zinc-500 mb-2 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Itens por prioridade
              {janelaAberta && ativos.length > 0 && (
                <span className="ml-1 text-zinc-600">(passe o mouse para remover)</span>
              )}
            </p>
            <div className="space-y-1.5">
              {[...p.itens].sort(porPrioridade).map((item, idx) => {
                const age = item.data_producao_bdgex
                  ? Math.floor((Date.now() - new Date(item.data_producao_bdgex).getTime()) / (365.25 * 24 * 3600 * 1000))
                  : null
                const ageColor = age === null ? '' : age < 5 ? 'text-emerald-400' : age < 10 ? 'text-lime-400' : age < 20 ? 'text-yellow-400' : age < 30 ? 'text-orange-400' : 'text-red-400'
                return (
                  <div key={item.id} className={`flex items-center flex-wrap gap-x-2 gap-y-1 text-xs group border rounded-lg px-3 py-2 ${item.removido ? 'bg-red-950/20 border-red-500/20 text-zinc-500' : 'bg-zinc-800/40 border-zinc-700/30 text-zinc-400'}`}>
                    <span className="text-zinc-600 w-4 text-center shrink-0">{idx + 1}</span>
                    {item.mi
                      ? <span className={`text-emerald-400 font-mono shrink-0 font-medium ${item.removido ? 'line-through decoration-red-400 decoration-2' : ''}`}>{item.mi}</span>
                      : <span className={`text-emerald-400 font-mono shrink-0 font-medium ${item.removido ? 'line-through decoration-red-400 decoration-2' : ''}`}>{item.inom}</span>
                    }
                    {item.mi && <span className={`text-zinc-500 font-mono shrink-0 text-[10px] ${item.removido ? 'line-through decoration-red-400 decoration-2' : ''}`}>({item.inom})</span>}
                    <span className={`shrink-0 text-zinc-300 ${item.removido ? 'line-through decoration-red-400 decoration-2 text-zinc-500' : ''}`}>{TIPO_PRODUTO_LABELS[item.tipo_produto]}</span>
                    <span className="text-zinc-600 shrink-0">·</span>
                    <span className={`shrink-0 ${item.removido ? 'line-through decoration-red-400 decoration-2' : ''}`}>{item.escala}</span>
                    {item.removido && (
                      <span className="shrink-0 rounded border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
                        Removido
                      </span>
                    )}
                    {item.disponivel_bdgex && (
                      <span className="text-emerald-500 shrink-0 font-medium">✓ BDGEx</span>
                    )}
                    {age !== null && (
                      <span className={`shrink-0 font-semibold ${ageColor}`} title={`Publicação: ${item.data_producao_bdgex}`}>
                        {age}a
                      </span>
                    )}
                    {(item.impressao_quantidade && item.impressao_tipo_material) && (
                      <span className="flex items-center gap-1 text-violet-400 shrink-0">
                        <Printer className="h-3 w-3" />
                        {item.impressao_quantidade}× {item.impressao_tipo_material}
                      </span>
                    )}
                    {janelaAberta && !item.removido && (
                      <button
                        onClick={() => setDeletingItem({ id: item.id, inom: item.inom, tipo_produto: item.tipo_produto, escala: item.escala })}
                        className="ml-auto opacity-0 group-hover:opacity-100 p-1 rounded text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="Remover item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
                Impressão solicitada
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
              className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver no BDGEx
            </a>
          )}

          {/* Motivo reprovação */}
          {p.motivo_reprovacao && (
            <p className="text-xs text-red-400">
              <span className="font-medium">Motivo reprovação:</span> {p.motivo_reprovacao}
            </p>
          )}

          {/* Observações */}
          {p.observacoes && (
            <p className="text-xs text-zinc-400">
              <span className="font-medium text-zinc-300">Observações: </span>
              {p.observacoes}
            </p>
          )}
          <div className="pt-1 flex flex-wrap items-center gap-2">
            <button
              onClick={() => onSpatialize(p)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
            >
              <MapPin className="h-3.5 w-3.5" />
              Ver no mapa
            </button>
          </div>
        </div>
      )}

      {/* Delete item modal */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg"><Trash2 className="h-5 w-5 text-red-400" /></div>
              <h2 className="text-base font-semibold text-zinc-100">Remover item</h2>
              <button onClick={() => setDeletingItem(null)} className="ml-auto text-zinc-500 hover:text-zinc-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-zinc-400">
              Remover <span className="font-mono text-emerald-400">{deletingItem.inom}</span> do pedido #{p.id}?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeletingItem(null)} className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5">Cancelar</button>
              <button onClick={handleDeleteItem} className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-400">Remover</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Encaminhar Lote Modal ────────────────────────────────────────────────────
interface EncaminharLoteModalProps {
  pedidos: Pedido[]
  label: string
  onConfirm: () => void
  onCancel: () => void
}

function EncaminharLoteModal({ pedidos: ps, label, onConfirm, onCancel }: EncaminharLoteModalProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const toggle = (id: number) =>
    setExpandedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-white/10 shrink-0">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-100">{label}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {ps.length} pedido{ps.length !== 1 ? 's' : ''} serão encaminhados ao próximo escalão
            </p>
          </div>
          <button onClick={onCancel} className="ml-auto text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Warning banner */}
        <div className="mx-5 mt-4 shrink-0 flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300 leading-relaxed">
            Após o encaminhamento não será possível editar ou cancelar os pedidos.
            Expanda cada pedido para revisar seus itens antes de confirmar.
          </p>
        </div>

        {/* Pedidos list */}
        <div className="overflow-y-auto flex-1 p-5 space-y-2">
          {ps.map((p, idx) => {
            const nomeDisplay = formatNomeComPosto(
              p.usuario_nome ?? '',
              p.usuario_posto_graduacao,
              p.usuario_nome_de_guerra,
            ) || '—'
            const tipos = [...new Set(p.itens.map(i => TIPO_PRODUTO_LABELS[i.tipo_produto]))].join(' · ') || '—'
            const isExp = expandedIds.has(p.id)
            return (
              <div key={p.id} className="bg-zinc-800/50 border border-zinc-700/40 rounded-xl overflow-hidden">
                {/* Row */}
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
                >
                  <span className="text-zinc-600 text-[10px] font-bold w-4 text-center shrink-0">{idx + 1}</span>
                  <span className="font-mono font-semibold text-emerald-400 text-sm shrink-0">#{p.id}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">{nomeDisplay}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{tipos} · {p.itens.length} item(ns)</p>
                  </div>
                  {isExp
                    ? <ChevronUp className="h-4 w-4 text-zinc-400 shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />}
                </button>

                {/* Expanded items */}
                {isExp && (
                  <div className="border-t border-zinc-700/40 px-3 py-2.5 space-y-1.5">
                    {[...p.itens].sort(porPrioridade).map((item, i) => (
                      <div
                        key={item.id}
                        className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-zinc-400 bg-zinc-800/60 border border-zinc-700/30 rounded-lg px-3 py-1.5"
                      >
                        <span className="text-zinc-600 w-4 text-center shrink-0">{i + 1}</span>
                        {item.mi
                          ? <span className="text-emerald-400 font-mono shrink-0 font-medium">{item.mi}</span>
                          : <span className="text-emerald-400 font-mono shrink-0 font-medium">{item.inom}</span>
                        }
                        {item.mi && <span className="text-zinc-500 font-mono shrink-0 text-[10px]">({item.inom})</span>}
                        <span className="shrink-0 text-zinc-300">{TIPO_PRODUTO_LABELS[item.tipo_produto]}</span>
                        <span className="text-zinc-600 shrink-0">·</span>
                        <span className="shrink-0">{item.escala}</span>
                        {item.disponivel_bdgex && (
                          <span className="text-emerald-500 shrink-0 text-[10px]">✓ BDGEx</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 pt-0 shrink-0">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 transition-colors"
          >
            {label} ({ps.length})
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Pending Action State ─────────────────────────────────────────────────────
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
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [duplicateModal, setDuplicateModal] = useState<{ dups: DuplicateItem[]; ids: number[] } | null>(null)
  const [manualDuplicates, setManualDuplicates] = useState<DuplicateItem[] | null>(null)
  const [spatializePedido, setSpatializePedido] = useState<Pedido | null>(null)
  const [processing, setProcessing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [cmila, setCmila] = useState('')   // filtro por Comando Militar de Área
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
        const sorted = [...pr.data].sort(porPrioridade)
        setPedidos(sorted)
        setJanela(jr.data)
        setSelectedIds(new Set())
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
    if (selectedIds.size === visiveis.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(visiveis.map(p => p.id)))
  }

  // ── Encaminhar ───────────────────────────────────────────────────────────────
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
      if (dups.length > 0) { setDuplicateModal({ dups, ids }); return }
    } catch { /* ignore */ }
    await executeEncaminhar(ids)
  }

  const handleVerificarDuplicatas = async () => {
    setProcessing(true)
    try {
      const res = await pedidosApi.getDuplicatas({ todos: true })
      setManualDuplicates(res.data)
      if (res.data.length === 0) toast.success('Nenhuma duplicata encontrada')
    } catch {
      toast.error('Erro ao verificar duplicatas')
    } finally {
      setProcessing(false)
    }
  }

  const handleEncaminharLote = async () => {
    const ids = selectedIds.size > 0 ? [...selectedIds] : visiveis.map(p => p.id)
    if (ids.length === 0) { toast.error('Nenhum pedido na fila'); return }
    setPendingAction({ type: 'encaminhar-lote', ids })
  }

  const confirmEncaminhar = async () => {
    if (!pendingAction || (pendingAction.type !== 'encaminhar' && pendingAction.type !== 'encaminhar-lote')) return
    const ids = pendingAction.type === 'encaminhar' ? [pendingAction.id] : pendingAction.ids
    setPendingAction(null)
    await handleEncaminharComDuplicatas(ids)
  }

  // ── Reprovar ─────────────────────────────────────────────────────────────────
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
      try { await pedidosApi.review(id, 'reprovar', motivo); ok++ }
      catch { fail++ }
    }
    if (ok > 0) toast.success(`${ok} pedido(s) cancelado(s)`)
    if (fail > 0) toast.error(`${fail} pedido(s) não puderam ser cancelados`)
    setProcessing(false)
    load()
  }

  // ── Filtros de exibição ──────────────────────────────────────────────────────
  // Atenção: reordenar envia a lista inteira ao backend, que grava a prioridade
  // pela posição. Reordenar com filtro ativo reatribuiria as prioridades 1..N
  // apenas ao subconjunto visível, corrompendo a ordem dos demais pedidos — por
  // isso o arrasto fica desabilitado enquanto houver filtro.
  const filtrosAtivos = Boolean(search.trim() || cmila)
  const visiveis = pedidos
    .filter(p => !cmila || p.regiao_militar === cmila)
    .filter(p => casaBusca(search, [
      String(p.id),
      p.usuario_nome,
      p.usuario_om,
      p.status,
      p.orgao_vinculante,
      p.regiao_militar,
      ...p.itens.map(i => i.inom),
      ...p.itens.map(i => i.mi),
    ]))

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

  const allSelected = visiveis.length > 0 && selectedIds.size === visiveis.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < visiveis.length
  const selCount = selectedIds.size

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Pedidos Pendentes</h1>
          {pedidos.length > 0 && (
            <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1.5">
              <GripVertical className="h-3.5 w-3.5" />
              Arraste o pedido para reordenar sua prioridade
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mapa */}
          <button
            onClick={() => setShowMap(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showMap ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'}`}
          >
            <Map className="h-4 w-4" />
            {showMap ? 'Fechar mapa' : 'Ver no mapa'}
          </button>

          {/* Exportar */}
          {pedidos.length > 0 && (
            <button
              onClick={baixarRelatorio}
              disabled={exportando}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Baixar pedidos em ZIP (CSV + GeoJSON + LEIA-ME)"
            >
              {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Baixar pedidos
            </button>
          )}

          {pedidos.length > 0 && (
            <button
              onClick={handleVerificarDuplicatas}
              disabled={processing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              Duplicatas
            </button>
          )}

          {/* Selecionar todos (chip) */}
          {pedidos.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200 transition-colors"
            >
              <input
                type="checkbox"
                readOnly
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected }}
                className="h-3.5 w-3.5 accent-emerald-500 pointer-events-none"
              />
              {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
          )}

          {/* Reprovar selecionados */}
          {selCount > 0 && (
            <button
              onClick={() => setPendingAction({ type: 'reprovar-lote', ids: [...selectedIds] })}
              disabled={!janelaAberta || processing}
              className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-red-500/20 transition-colors"
            >
              <Ban className="h-4 w-4" />
              Cancelar ({selCount})
            </button>
          )}

          {/* Encaminhar */}
          <button
            onClick={handleEncaminharLote}
            disabled={pedidos.length === 0 || !janelaAberta || processing}
            className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-emerald-400 transition-colors"
          >
            <Send className="h-4 w-4" />
            {processing
              ? 'Processando...'
              : selCount > 0
                ? `${consolidateLabel} (${selCount})`
                : `${consolidateLabel} (${pedidos.length})`}
          </button>
        </div>
      </div>

      {/* Janela banner */}
      <JanelaBanner janela={janela} perfil={perfil} />

      {/* Mapa */}
      {showMap && (
        <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden" style={{ height: '380px' }}>
          <PedidosMap className="w-full h-full" />
        </div>
      )}

      {/* ── Busca + filtro por C Mil A ── */}
      {pedidos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[16rem]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={'Buscar por ID, solicitante, OM, INOM…  ("aspas" = exato)'}
              className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <select
            value={cmila}
            onChange={e => setCmila(e.target.value)}
            title="Filtrar por Comando Militar de Área"
            className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Todos os C Mil A</option>
            {CMILA_CODES.map(c => <option key={c} value={c}>{cmilaLabel(c)}</option>)}
          </select>
          {filtrosAtivos && (
            <button
              onClick={() => { setSearch(''); setCmila('') }}
              className="px-3 py-2 rounded-xl text-sm text-zinc-400 border border-white/10 hover:bg-white/5 transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {filtrosAtivos && pedidos.length > 0 && (
        <p className="text-xs text-amber-400/80">
          Exibindo {visiveis.length} de {pedidos.length} pedidos. Para reordenar
          por prioridade, limpe os filtros — o arrasto reordena a fila inteira.
        </p>
      )}

      {/* ── Lista de pedidos ── */}
      {visiveis.length === 0 ? (
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-12 text-center">
          <CheckCircle className="h-10 w-10 text-emerald-500/40 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">
            {pedidos.length === 0
              ? 'Nenhum pedido aguardando revisão.'
              : 'Nenhum pedido encontrado para este filtro.'}
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={filtrosAtivos ? [] : visiveis.map(p => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {visiveis.map((p) => (
                <PedidoCard
                  key={p.id}
                  pedido={p}
                  rank={pedidos.findIndex(x => x.id === p.id) + 1}
                  isExpanded={expandedId === p.id}
                  janelaAberta={janelaAberta}
                  selected={selectedIds.has(p.id)}
                  onToggleSelect={toggleSelect}
                  onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                  onEncaminhar={(id) => setPendingAction({ type: 'encaminhar', id })}
                  onReprovar={(id) => setPendingAction({ type: 'reprovar', id })}
                  onSpatialize={setSpatializePedido}
                  onReload={load}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* ── Modais de confirmação ── */}

      {spatializePedido && (
        <PedidoSpatializeModal pedido={spatializePedido} onClose={() => setSpatializePedido(null)} />
      )}

      {manualDuplicates && (
        <DuplicateItemsModal duplicates={manualDuplicates} onClose={() => setManualDuplicates(null)} />
      )}

      {pendingAction?.type === 'encaminhar-lote' && (
        <EncaminharLoteModal
          pedidos={pedidos.filter(p => (pendingAction as { type: 'encaminhar-lote'; ids: number[] }).ids.includes(p.id))}
          label={consolidateLabel}
          onConfirm={confirmEncaminhar}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {pendingAction?.type === 'encaminhar' && (() => {
        const p = pedidos.find(x => x.id === (pendingAction as { type: 'encaminhar'; id: number }).id)
        return (
          <ConfirmModal
            title="Encaminhar pedido"
            message={`Encaminhar Pedido #${p?.id ?? ''} de ${p?.usuario_nome ?? '—'} (${p?.usuario_om ?? '—'}) ao próximo escalão?`}
            confirmLabel="Encaminhar"
            confirmClass="bg-emerald-500 hover:bg-emerald-400"
            onConfirm={confirmEncaminhar}
            onCancel={() => setPendingAction(null)}
          />
        )
      })()}

      {pendingAction?.type === 'reprovar' && (() => {
        const p = pedidos.find(x => x.id === (pendingAction as { type: 'reprovar'; id: number }).id)
        return (
          <ConfirmModal
            title="Cancelar pedido"
            message={`Cancelar o Pedido #${p?.id ?? ''} de ${p?.usuario_nome ?? '—'} (${p?.usuario_om ?? '—'})?`}
            confirmLabel="Cancelar pedido"
            confirmClass="bg-red-500 hover:bg-red-400"
            requireMotivo
            onConfirm={confirmReprovar}
            onCancel={() => setPendingAction(null)}
          />
        )
      })()}

      {pendingAction?.type === 'reprovar-lote' && (
        <ConfirmModal
          title="Cancelar pedidos selecionados"
          message={`Cancelar ${(pendingAction as { type: 'reprovar-lote'; ids: number[] }).ids.length} pedido(s) selecionados?`}
          confirmLabel="Cancelar selecionados"
          confirmClass="bg-red-500 hover:bg-red-400"
          requireMotivo
          onConfirm={confirmReprovarLote}
          onCancel={() => setPendingAction(null)}
        />
      )}

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
