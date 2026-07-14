import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Map, CheckCircle, ChevronDown, ChevronUp,
  Phone, Mail, Building2, Briefcase, Info,
  Download, Loader2, CalendarClock, Printer, ExternalLink, FileText,
  MapPin, Copy,
} from 'lucide-react'
import { pedidosApi, type DuplicateItem } from '../../api/pedidos'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { PedidosMap } from '../../components/map/PedidosMap'
import { PedidoSpatializeModal } from '../../components/map/PedidoSpatializeModal'
import { DuplicateItemsModal } from '../../components/shared/DuplicateItemsModal'
import type { Pedido } from '../../types/pedido'
import { TIPO_PRODUTO_LABELS } from '../../types/pedido'
import { useExportRelatorio } from '../../hooks/useExportRelatorio'
import { formatNomeComPosto } from '../../data/postos'

/** Cores por órgão vinculante */
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

// ─── Pedido Card ──────────────────────────────────────────────────────────────
interface PedidoCardProps {
  pedido: Pedido
  rank: number
  isExpanded: boolean
  onToggleExpand: (id: number) => void
  onSpatialize: (pedido: Pedido) => void
}

function PedidoCard({ pedido: p, rank, isExpanded, onToggleExpand, onSpatialize }: PedidoCardProps) {
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

  const nomeDisplay = formatNomeComPosto(
    p.usuario_nome ?? '',
    p.usuario_posto_graduacao,
    p.usuario_nome_de_guerra,
  ) || '—'

  return (
    <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
      {/* ── Summary row ── */}
      <div className="flex items-center gap-2 px-3 py-3">
        {/* Rank */}
        <span className="text-[11px] font-bold text-zinc-600 w-5 text-center shrink-0">{rank}</span>

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

        {/* Expand toggle */}
        <button
          onClick={() => onToggleExpand(p.id)}
          className={`p-1.5 rounded-md transition-colors shrink-0 ${
            isExpanded ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
          }`}
          title={isExpanded ? 'Fechar detalhes' : 'Ver detalhes'}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
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
            </p>
            <div className="space-y-1.5">
              {[...p.itens].sort((a, b) => a.prioridade - b.prioridade).map((item, idx) => {
                const age = item.data_producao_bdgex
                  ? Math.floor((Date.now() - new Date(item.data_producao_bdgex).getTime()) / (365.25 * 24 * 3600 * 1000))
                  : null
                const ageColor = age === null ? '' : age < 5 ? 'text-emerald-400' : age < 10 ? 'text-lime-400' : age < 20 ? 'text-yellow-400' : age < 30 ? 'text-orange-400' : 'text-red-400'
                return (
                  <div key={item.id} className={`flex items-center flex-wrap gap-x-2 gap-y-1 text-xs border rounded-lg px-3 py-2 ${item.removido ? 'bg-red-950/20 border-red-500/20 text-zinc-500' : 'bg-zinc-800/40 border-zinc-700/30 text-zinc-400'}`}>
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
              <span className="font-medium text-zinc-300">Observações:</span> {p.observacoes}
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
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function PedidosHomologados() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [showMap, setShowMap] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [spatializePedido, setSpatializePedido] = useState<Pedido | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicateItem[] | null>(null)
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const { exportando, baixarRelatorio } = useExportRelatorio()

  const load = useCallback(() => {
    setLoading(true)
    pedidosApi.listHomologados()
      .then(r => setPedidos(r.data))
      .catch(() => toast.error('Erro ao carregar pedidos homologados'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleVerificarDuplicatas = async () => {
    setCheckingDuplicates(true)
    try {
      const res = await pedidosApi.getDuplicatas({ todos: true })
      setDuplicates(res.data)
      if (res.data.length === 0) toast.success('Nenhuma duplicata encontrada')
    } catch {
      toast.error('Erro ao verificar duplicatas')
    } finally {
      setCheckingDuplicates(false)
    }
  }

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
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mapa */}
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
              disabled={checkingDuplicates}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkingDuplicates ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              Duplicatas
            </button>
          )}
        </div>
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

      {/* Lista */}
      {pedidos.length === 0 ? (
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-12 text-center">
          <CheckCircle className="h-10 w-10 text-emerald-500/40 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Nenhum pedido homologado encontrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pedidos.map((p, idx) => (
            <PedidoCard
              key={p.id}
              pedido={p}
              rank={idx + 1}
              isExpanded={expandedId === p.id}
              onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
              onSpatialize={setSpatializePedido}
            />
          ))}
        </div>
      )}

      {spatializePedido && (
        <PedidoSpatializeModal pedido={spatializePedido} onClose={() => setSpatializePedido(null)} />
      )}

      {duplicates && (
        <DuplicateItemsModal duplicates={duplicates} onClose={() => setDuplicates(null)} />
      )}
    </div>
  )
}
