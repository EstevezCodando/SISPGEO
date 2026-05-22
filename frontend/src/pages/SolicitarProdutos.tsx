import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { addDays, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ShoppingCart, Trash2, ClipboardCheck, Map as MapIcon,
  Satellite, AlertTriangle, User, Phone, Building2, X, Check, Lock, CalendarX, Loader2,
} from 'lucide-react'
import type { FeatureCollection, Feature } from 'geojson'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import api from '../api/client'
import { formatNomeComPosto } from '../data/postos'
import { pedidosApi } from '../api/pedidos'
import { janelasApi, type MinhaJanela } from '../api/janelas'
import { operacoesApi, type Operacao } from '../api/operacoes'
import { configApi, type ConfigEntrega } from '../api/config'
import { useCartStore } from '../store/cartStore'
import { useAuthStore } from '../store/authStore'
import { InteractiveMap, type Basemap } from '../components/map/InteractiveMap'
import { PedidosMap } from '../components/map/PedidosMap'
import type { TipoProduto, Escala } from '../types/pedido'
import { TIPO_PRODUTO_LABELS } from '../types/pedido'
import type { CartItem } from '../types/pedido'

const ESCALAS: Escala[] = ['1:25.000', '1:50.000', '1:100.000', '1:250.000']

// Prazos mínimos locais — usados como fallback se a API ainda não respondeu.
// Valores autoritativos vêm de GET /config/entrega (PRAZOS_MINIMOS no backend).
const PRAZO_FALLBACK: Record<TipoProduto, number> = {
  CARTA_TOPOGRAFICA: 180,
  CARTA_ORTOIMAGEM:   60,
  ORTOIMAGEM:          40,
  MDT:                 40,
  MDS:                 40,
  CDGV:               180,
  IMPRESSAO:           30,
}

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
const labelCls = 'block text-xs font-medium text-zinc-400 mb-1'

// ── Camada GeoJSON vanilla Leaflet (dentro de MapContainer) ──────────────────
// Usa L.geoJSON + useMap para garantir tooltips funcionando 100%.
// O prop `itemMap` fornece o MI do CartItem como fallback quando
// feature.properties.mi está nulo (comum em escalas sem dado MI no BDGEx).
function RevisaoGeoJSONLayer({
  geojson,
  itemMap,
}: {
  geojson: FeatureCollection
  itemMap: Map<string, CartItem>
}) {
  const map = useMap()

  useEffect(() => {
    const layer = L.geoJSON(geojson, {
      style: () => ({
        color: '#3b82f6',
        weight: 2,
        fillColor: '#3b82f6',
        fillOpacity: 0.35,
      }),
      onEachFeature: (feature: Feature, lyr: L.Layer) => {
        const props = (feature.properties ?? {}) as { inom?: string; mi?: string | null }
        const inom = props.inom ?? '—'
        const cartItem = itemMap.get(inom)
        // Prioridade: feature.properties.mi → CartItem.mi → ausente
        const mi = props.mi ?? cartItem?.mi ?? null
        let tip = `<b>${inom}</b>`
        if (mi) tip += `<br><span style="color:#a1a1aa">MI:</span> <span style="color:#34d399;font-weight:600">${mi}</span>`
        if (cartItem) tip += `<br><span style="color:#71717a">${TIPO_PRODUTO_LABELS[cartItem.tipo_produto]} · ${cartItem.escala}</span>`
        lyr.bindTooltip(tip, { sticky: true, className: 'leaflet-dark-tooltip' })
      },
    }).addTo(map)

    // Ajusta o zoom para as células selecionadas
    try {
      const bounds = layer.getBounds()
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] })
    } catch { /* ignore */ }

    return () => { layer.remove() }
  }, [geojson, map, itemMap])

  return null
}

// ── Modal de Revisão ──────────────────────────────────────────────────────────
interface RevisaoModalProps {
  items: CartItem[]
  onRemoveItem: (item: CartItem) => void
  onClose: () => void
  onConfirm: () => void
  submitting: boolean
}

function RevisaoModal({ items, onRemoveItem, onClose, onConfirm, submitting }: RevisaoModalProps) {
  const { user } = useAuthStore()

  // Fonte de geometrias: carregada uma única vez ao abrir o modal
  const [rawGrid, setRawGrid] = useState<FeatureCollection | null>(null)
  const [loadingMap, setLoadingMap] = useState(true)

  // Lookup MI/produto por INOM para tooltip no mapa
  const itemMap = useMemo(
    () => new Map<string, CartItem>(items.map(i => [i.inom, i] as [string, CartItem])),
    [items],
  )

  useEffect(() => {
    if (items.length === 0) { setLoadingMap(false); return }
    api
      .post('/map/features-preview',
        items.map(i => ({ inom: i.inom, escala: i.escala, tipo_produto: i.tipo_produto })),
      )
      .then(r => setRawGrid(r.data as FeatureCollection))
      .catch(() => { /* mapa fica sem geometrias — não bloqueia o fluxo */ })
      .finally(() => setLoadingMap(false))
  }, []) // só na abertura — geometrias ficam em rawGrid

  // Filtra rawGrid pelos INOMs que ainda estão no carrinho (reage a remoções)
  const filteredGrid = useMemo<FeatureCollection | null>(() => {
    if (!rawGrid) return null
    const currentInoms = new Set(items.map(i => i.inom))
    const features = rawGrid.features.filter(
      f => f.properties && currentInoms.has(f.properties.inom as string),
    )
    return features.length > 0 ? { type: 'FeatureCollection', features } : null
  }, [rawGrid, items])

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-emerald-400" />
              Revisar Pedido
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">{items.length} produto{items.length !== 1 ? 's' : ''} selecionado{items.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 gap-0">
          {/* Coluna esquerda — Mapa */}
          <div className="flex-1 min-w-0 border-r border-white/10 relative">
            {loadingMap ? (
              <div className="h-full flex items-center justify-center gap-2 text-zinc-400 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                Carregando mapa…
              </div>
            ) : filteredGrid && filteredGrid.features.length > 0 ? (
              <MapContainer
                center={[-15, -52]}
                zoom={5}
                style={{ height: '100%', width: '100%', minHeight: 320, background: '#18181b' }}
                zoomControl
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='© OpenStreetMap'
                />
                <RevisaoGeoJSONLayer geojson={filteredGrid} itemMap={itemMap} />
              </MapContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500 text-sm p-6 text-center">
                Nenhum produto com geometria carregada
              </div>
            )}
          </div>

          {/* Coluna direita — Dados e itens */}
          <div className="w-80 shrink-0 flex flex-col overflow-hidden">
            {/* Dados do solicitante */}
            <div className="px-5 py-4 border-b border-white/10 bg-zinc-800/30">
              <p className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Solicitante</p>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-zinc-300">
                  <User className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  <span className="font-medium">
                    {user ? formatNomeComPosto(user.nome, user.posto_graduacao) : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <Building2 className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  <span>{user?.om ?? '—'}</span>
                </div>
                {user?.telefone && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Phone className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                    <span>{user.telefone}</span>
                  </div>
                )}
                <div className="text-zinc-500 truncate">{user?.email ?? '—'}</div>
              </div>
            </div>

            {/* Lista de itens */}
            <div className="flex-1 overflow-auto p-4">
              <p className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide">
                Produtos ({items.length})
              </p>
              <div className="space-y-1.5">
                {items.map((item) => (
                  <div
                    key={item.inom}
                    className="flex items-start justify-between gap-2 bg-zinc-800/60 border border-zinc-700/40 rounded-lg px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-mono font-medium text-emerald-400 truncate">{item.inom}</p>
                      <p className="text-zinc-400">{TIPO_PRODUTO_LABELS[item.tipo_produto]}</p>
                      <p className="text-zinc-500">{item.escala}</p>
                    </div>
                    <button
                      onClick={() => onRemoveItem(item)}
                      disabled={items.length <= 1}
                      className="text-zinc-600 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors mt-0.5 shrink-0"
                      title="Remover item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-white/10 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-colors"
          >
            Voltar e editar
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting || items.length === 0}
            className="flex-1 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            <Check className="h-4 w-4" />
            {submitting ? 'Enviando...' : 'Revisado'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export function SolicitarProdutos() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const {
    items, tipoProduto, escala, dataEntrega, operacaoId, finalidade,
    setTipoProduto, setEscala, setDataEntrega, setOperacaoId, setFinalidade,
    removeItem, clear,
  } = useCartStore()

  const [operacoes, setOperacoes] = useState<Operacao[]>([])
  const [novaOperacao, setNovaOperacao] = useState('')
  const [showNewOp, setShowNewOp] = useState(false)
  const [inomGrid, setInomGrid] = useState<FeatureCollection | null>(null)
  const [isLoadingGrid, setIsLoadingGrid] = useState(false)
  // Cache de grades por (tipoProduto|||escala) — evita re-fetch e re-parse ao alternar produtos
  const gridCacheRef = useRef<Map<string, FeatureCollection>>(new Map())
  const [showData, setShowData] = useState(true)
  const [basemap, setBasemap] = useState<Basemap>('osm')
  const [showPedidosMap, setShowPedidosMap] = useState(false)
  const [showRevisao, setShowRevisao] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [minhaJanela, setMinhaJanela] = useState<MinhaJanela | null>(null)
  const [configEntrega, setConfigEntrega] = useState<ConfigEntrega | null>(null)
  const finalidadeRef = useRef<HTMLTextAreaElement>(null)

  // "Outros" = operacaoId null
  const isOutros = operacaoId === null

  useEffect(() => {
    operacoesApi.list().then((r) => setOperacoes(r.data)).catch(() => {})
    // Verifica janela ativa para este perfil
    janelasApi.minhaJanela()
      .then(r => setMinhaJanela(r.data))
      .catch(() => setMinhaJanela({ aberta: true, data_inicio: null, data_fim: null, tipo_janela: null, dias_restantes: null, configurada: false }))
    // Carrega configuração global de datas mínimas de entrega
    configApi.getEntrega().then(r => setConfigEntrega(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    // Limpa o grid imediatamente ao resetar selecção — impede grid antigo no remount
    if (!escala || !dataEntrega || !tipoProduto) {
      setInomGrid(null)
      return
    }
    const cacheKey = `${tipoProduto}|||${escala}`
    // Serve do cache instantaneamente (sem rede, sem re-parse)
    if (gridCacheRef.current.has(cacheKey)) {
      setInomGrid(gridCacheRef.current.get(cacheKey)!)
      return
    }
    const controller = new AbortController()
    setIsLoadingGrid(true)
    api.get('/map/inom-grid', {
      params: { scale: escala, tipo_produto: tipoProduto },
      signal: controller.signal,
    })
      .then((r) => {
        const data = r.data as FeatureCollection
        gridCacheRef.current.set(cacheKey, data)
        setInomGrid(data)
      })
      .catch((err) => {
        if (err?.code === 'ERR_CANCELED') return
        toast.error('Erro ao carregar grade INOM')
      })
      .finally(() => setIsLoadingGrid(false))
    return () => controller.abort()
  }, [escala, dataEntrega, tipoProduto])

  // minDate = data_base (global) + prazo_minimo do produto selecionado.
  // Se a configuração ainda não carregou, usa fallback local.
  const minDate = (() => {
    if (!tipoProduto) return format(addDays(new Date(), 1), 'yyyy-MM-dd')
    if (configEntrega?.datas_minimas?.[tipoProduto]) {
      return configEntrega.datas_minimas[tipoProduto]
    }
    // fallback enquanto API carrega
    const prazo = PRAZO_FALLBACK[tipoProduto]
    return format(addDays(new Date(configEntrega?.data_base + 'T00:00:00' || new Date()), prazo), 'yyyy-MM-dd')
  })()

  const handleCreateOperacao = async () => {
    if (!novaOperacao.trim()) return
    try {
      const r = await operacoesApi.create(novaOperacao.trim())
      setOperacoes((prev) => [...prev, r.data])
      setOperacaoId(r.data.id)
      setNovaOperacao('')
      setShowNewOp(false)
      toast.success('Operação criada')
    } catch {
      toast.error('Erro ao criar operação')
    }
  }

  const handleOperacaoChange = (v: string) => {
    if (v === '__new__') { setShowNewOp(true); return }
    setOperacaoId(v ? Number(v) : null)
    // Se "Outros" selecionado, foca na finalidade
    if (!v) {
      setTimeout(() => {
        finalidadeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        finalidadeRef.current?.focus()
      }, 100)
    }
  }

  const handleSubmit = async () => {
    if (items.length === 0) { toast.error('Adicione ao menos um produto'); return }
    if (!dataEntrega) { toast.error('Informe a data de entrega'); return }
    if (isOutros && finalidade.trim().length < 10) {
      toast.error('Preencha a finalidade com ao menos 10 caracteres ao selecionar "Outros"')
      finalidadeRef.current?.focus()
      return
    }
    if (!user?.orgao_vinculante) {
      toast.error('Seu perfil não tem órgão vinculante configurado. Contate o Gestor Cartográfico (DSG).')
      return
    }

    setSubmitting(true)
    try {
      const pedido = await pedidosApi.create({
        operacao_id: operacaoId,
        data_entrega: dataEntrega,
        finalidade: finalidade || null,
        itens: items.map((i) => ({
          tipo_produto: i.tipo_produto,
          escala: i.escala,
          inom: i.inom,
          mi: i.mi,
          solicitar_mesmo_disponivel: i.solicitar_mesmo_disponivel,
        })),
      })

      const isSupervisorOrConsolidador =
        user?.perfil === 'SUPERVISOR' || user?.perfil === 'CONSOLIDADOR'

      if (isSupervisorOrConsolidador) {
        // Supervisor/Consolidador: auto-submete para entrar direto na fila de pendentes
        await pedidosApi.submit(pedido.data.id)
        toast.success(`Pedido #${pedido.data.id} enviado para análise!`)
        clear()
        setShowRevisao(false)
        navigate('/gestor/pedidos')
      } else {
        // Solicitante: salva em RASCUNHO — envio acontece em Meus Pedidos
        toast.success(`Pedido #${pedido.data.id} salvo! Acesse Meus Pedidos para gerenciar.`)
        clear()
        setShowRevisao(false)
        navigate('/meus-pedidos')
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao submeter pedido')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenRevisao = () => {
    if (items.length === 0) { toast.error('Adicione ao menos um produto ao carrinho'); return }
    if (!dataEntrega) { toast.error('Informe a data sugerida de entrega'); return }
    if (isOutros && finalidade.trim().length < 10) {
      toast.error('Preencha a finalidade com ao menos 10 caracteres ao selecionar "Outros"')
      finalidadeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      finalidadeRef.current?.focus()
      return
    }
    setShowRevisao(true)
  }

  // Janela fechada — só bloqueia SOLICITANTE; SUPERVISOR pode solicitar a qualquer momento
  const janelaFechada =
    user?.perfil === 'SOLICITANTE' && minhaJanela?.configurada && !minhaJanela?.aberta

  if (janelaFechada) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-10 max-w-md w-full shadow-2xl">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-zinc-800 rounded-full">
              <CalendarX className="h-10 w-10 text-zinc-500" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-zinc-300 mb-2">Período de Solicitações Encerrado</h2>
          <p className="text-sm text-zinc-500 leading-relaxed mb-6">
            O prazo para inclusão de novos produtos geoespaciais está encerrado. Nenhum produto pode ser adicionado neste momento.
          </p>
          {minhaJanela?.data_fim && (
            <p className="text-xs text-zinc-600 mb-4">
              Encerrado em {new Date(minhaJanela.data_fim).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          )}
          <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-left">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300/80 leading-relaxed">
              Caso haja necessidade de alteração, entre em contato com a <strong className="text-amber-300">SSGeoInt do seu Cmd Mil A enquadrante</strong> ou o órgão ao qual o Sr. está subordinado.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-500">
            <Lock className="h-3.5 w-3.5" />
            Acesso bloqueado pelo administrador
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Solicitar Produtos</h1>
        <button
          onClick={() => setShowPedidosMap((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            showPedidosMap
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200 hover:border-zinc-600'
          }`}
        >
          <MapIcon className="h-4 w-4" />
          {showPedidosMap ? 'Ocultar pedidos anteriores' : 'Visualizar pedidos anteriores'}
        </button>
      </div>

      {showPedidosMap && (
        <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden shrink-0" style={{ height: '340px' }}>
          <PedidosMap className="w-full h-full" />
        </div>
      )}

      {/* Seletores */}
      <div className="bg-zinc-900 border border-white/10 rounded-xl p-4 shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Operação */}
          <div>
            <label className={labelCls}>Operação</label>
            {showNewOp ? (
              <div className="flex gap-1">
                <input
                  value={novaOperacao}
                  onChange={(e) => setNovaOperacao(e.target.value)}
                  maxLength={100}
                  className={inputCls}
                  placeholder="Nome da operação"
                />
                <button onClick={handleCreateOperacao} className="bg-emerald-500 text-white px-2 rounded-lg text-xs hover:bg-emerald-400 transition-colors">OK</button>
                <button onClick={() => setShowNewOp(false)} className="text-zinc-400 px-1 text-xs hover:text-zinc-200">✕</button>
              </div>
            ) : (
              <select
                value={operacaoId ?? ''}
                onChange={(e) => handleOperacaoChange(e.target.value)}
                className={inputCls}
              >
                <option value="" className="bg-zinc-800">Outros</option>
                {operacoes.map((op) => <option key={op.id} value={op.id} className="bg-zinc-800">{op.nome}</option>)}
                <option value="__new__" className="bg-zinc-800">+ Nova Operação</option>
              </select>
            )}
            {/* Alerta "Outros" */}
            {isOutros && (
              <div className="flex items-start gap-1.5 mt-1.5 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-300/90 leading-snug">
                  Preencha a <strong>finalidade</strong> abaixo descrevendo o objetivo do pedido, ou selecione{' '}
                  <button
                    type="button"
                    onClick={() => setShowNewOp(true)}
                    className="underline text-amber-300 hover:text-amber-200 font-semibold transition-colors"
                  >
                    + Nova Operação
                  </button>{' '}
                  para cadastrar uma operação específica.
                </p>
              </div>
            )}
          </div>

          {/* Tipo de Produto */}
          <div>
            <label className={labelCls}>Tipo de Produto</label>
            <select
              value={tipoProduto ?? ''}
              onChange={(e) => {
                setTipoProduto((e.target.value as TipoProduto) || null)
                setEscala(null)
                setDataEntrega(null)
              }}
              className={inputCls}
            >
              <option value="" className="bg-zinc-800">Selecione...</option>
              {Object.entries(TIPO_PRODUTO_LABELS).map(([k, v]) => (
                <option key={k} value={k} className="bg-zinc-800">{v}</option>
              ))}
            </select>
          </div>

          {/* Escala */}
          <div>
            <label className={labelCls}>Escala</label>
            <select
              value={escala ?? ''}
              onChange={(e) => {
                setEscala((e.target.value as Escala) || null)
                setDataEntrega(null)
              }}
              disabled={!tipoProduto}
              className={inputCls}
            >
              <option value="" className="bg-zinc-800">Selecione...</option>
              {ESCALAS.map((s) => <option key={s} value={s} className="bg-zinc-800">{s}</option>)}
            </select>
          </div>

          {/* Data de Entrega */}
          <div>
            <label className={labelCls}>Data sugerida de entrega</label>
            <input
              type="date"
              value={dataEntrega ?? ''}
              min={minDate}
              onChange={(e) => setDataEntrega(e.target.value || null)}
              disabled={!escala}
              className={inputCls}
            />
            {tipoProduto && minDate && (
              <p className="text-[11px] text-zinc-600 mt-1">
                Mínimo:{' '}
                <span className="text-zinc-400">
                  {new Date(minDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
                {configEntrega && (
                  <span className="text-zinc-600">
                    {' '}(+{configEntrega.prazos_minimos[tipoProduto] ?? PRAZO_FALLBACK[tipoProduto]}d a partir de{' '}
                    {new Date(configEntrega.data_base + 'T00:00:00').toLocaleDateString('pt-BR')})
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

      </div>

      {/* Mapa + Carrinho */}
      <div className="flex flex-1 gap-4 min-h-0">
        <div className="flex-1 bg-zinc-900 border border-white/10 rounded-xl overflow-hidden relative">
          {!escala || !dataEntrega ? (
            <div className="h-full flex items-center justify-center text-zinc-500 text-sm p-8 text-center">
              Selecione tipo de produto, escala e data de entrega para carregar o mapa
            </div>
          ) : (
            <>
              {/* Painel de camada */}
              <div className="absolute top-3 right-3 z-[1000] bg-zinc-900/90 backdrop-blur-sm border border-white/10 rounded-lg p-2.5 text-xs shadow-lg">
                {/* Switcher de basemap */}
                <div className="flex gap-1 mb-2.5">
                  <button
                    onClick={() => setBasemap('osm')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      basemap === 'osm'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                    }`}
                  >
                    <MapIcon className="h-3 w-3" /> OSM
                  </button>
                  <button
                    onClick={() => setBasemap('satellite')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      basemap === 'satellite'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                    }`}
                  >
                    <Satellite className="h-3 w-3" /> Satélite
                  </button>
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-zinc-300 mb-2">
                  <input type="checkbox" checked={showData} onChange={(e) => setShowData(e.target.checked)} className="accent-emerald-500" />
                  Dados do BDGEx
                </label>
                {showData && (
                  <div className="space-y-0.5 text-zinc-400">
                    {[
                      { color: '#10b981', label: '< 5 anos' },
                      { color: '#84cc16', label: '5–10 anos' },
                      { color: '#eab308', label: '10–20 anos' },
                      { color: '#f97316', label: '20–30 anos' },
                      { color: '#ef4444', label: '> 30 anos' },
                      { color: '#52525b', label: 'Sem dado' },
                    ].map((l) => (
                      <div key={l.color} className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm inline-block border border-white/10 shrink-0" style={{ background: l.color }} />
                        {l.label}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 pt-2 border-t border-white/10 space-y-0.5 text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block border border-blue-500/50 bg-blue-500/30 shrink-0" />
                    Selecionado
                  </div>
                </div>
              </div>
              <div className="relative flex-1">
                <InteractiveMap
                  key={`${tipoProduto ?? 'none'}|||${escala ?? 'none'}`}
                  inomGrid={inomGrid}
                  showData={showData}
                  basemap={basemap}
                />
                {isLoadingGrid && (
                  <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-zinc-950/60 rounded-b-xl pointer-events-none">
                    <div className="flex items-center gap-2 bg-zinc-900/90 border border-white/10 rounded-lg px-4 py-2 text-sm text-zinc-300">
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                      Carregando grade INOM…
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Carrinho */}
        <div className="w-72 shrink-0 bg-zinc-900 border border-white/10 rounded-xl flex flex-col">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-emerald-400" />
            <span className="font-medium text-sm text-zinc-200">Carrinho ({items.length})</span>
          </div>

          <div className="flex-1 overflow-auto p-2 space-y-1">
            {items.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center mt-4 px-2">
                Clique nas células do mapa para adicionar produtos ao carrinho
              </p>
            ) : (
              items.map((item) => (
                <div key={item.inom} className="bg-zinc-800 border border-white/5 rounded-lg p-2 text-xs flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-200 truncate">{item.inom}</p>
                    <p className="text-zinc-400">{TIPO_PRODUTO_LABELS[item.tipo_produto]}</p>
                    <p className="text-zinc-500">{item.escala}</p>
                  </div>
                  <button onClick={() => removeItem(item.inom, item.tipo_produto, item.escala)} className="text-zinc-500 hover:text-red-400 transition-colors shrink-0 mt-0.5">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t border-white/10 space-y-2">
            <div>
              <label className={`${labelCls} ${isOutros ? 'text-amber-400' : ''}`}>
                Finalidade {isOutros && <span className="text-amber-400">*</span>}
              </label>
              <textarea
                ref={finalidadeRef}
                value={finalidade}
                onChange={(e) => setFinalidade(e.target.value)}
                rows={3}
                placeholder={isOutros ? 'Obrigatório: descreva a finalidade (mín. 10 caracteres)...' : 'Descreva a finalidade da solicitação...'}
                className={`w-full bg-zinc-800 border rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 resize-none transition-colors ${
                  isOutros
                    ? 'border-amber-500/50 focus:ring-amber-500 focus:border-amber-500'
                    : 'border-zinc-700 focus:ring-emerald-500 focus:border-emerald-500'
                }`}
              />
              {isOutros && finalidade.trim().length > 0 && finalidade.trim().length < 10 && (
                <p className="text-[11px] text-amber-400 mt-1">
                  {10 - finalidade.trim().length} caractere(s) restante(s)
                </p>
              )}
            </div>
            <button
              onClick={handleOpenRevisao}
              disabled={items.length === 0}
              className="w-full bg-emerald-500 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ClipboardCheck className="h-4 w-4" />
              Revisar Pedido
            </button>
          </div>
        </div>
      </div>

      {/* Modal de revisão */}
      {showRevisao && (
        <RevisaoModal
          items={items}
          onRemoveItem={(item) => removeItem(item.inom, item.tipo_produto, item.escala)}
          onClose={() => setShowRevisao(false)}
          onConfirm={handleSubmit}
          submitting={submitting}
        />
      )}
    </div>
  )
}
