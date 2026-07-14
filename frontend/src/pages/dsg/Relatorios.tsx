import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import type { FeatureCollection } from 'geojson'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BarChart2, Boxes, ClipboardList, Filter, Loader2, MapPinned, RefreshCw, X } from 'lucide-react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { pedidosApi, type RelatorioAnalitico } from '../../api/pedidos'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import { STATUS_LABELS, TIPO_PRODUTO_LABELS, type StatusPedido, type TipoProduto } from '../../types/pedido'

const ASC_OPTIONS = [
  { value: '', label: 'Todas as ASC' },
  { value: '1', label: '1º CGEO' },
  { value: '2', label: '2º CGEO' },
  { value: '3', label: '3º CGEO' },
  { value: '4', label: '4º CGEO' },
  { value: '5', label: '5º CGEO' },
]

const ESCOPO_OPTIONS = [
  { value: 'todos', label: 'Todos os pedidos' },
  { value: 'dsg', label: 'Pedidos DSG' },
] as const

type EscopoRelatorio = (typeof ESCOPO_OPTIONS)[number]['value']

const ESCALAS = ['1:25.000', '1:50.000', '1:100.000', '1:250.000']

function produtoLabel(tipo: string) {
  return TIPO_PRODUTO_LABELS[tipo as TipoProduto] ?? tipo
}

function statusLabel(status: string) {
  return STATUS_LABELS[status as StatusPedido] ?? status
}

function Card({ icon, label, value, sub }: { icon: ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-zinc-100">{value}</p>
          {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
        </div>
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-400">
          {icon}
        </div>
      </div>
    </div>
  )
}

function Panel({ title, children, right, className = '' }: { title: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-white/10 bg-zinc-900 p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function EmptyState() {
  return <p className="py-6 text-center text-sm text-zinc-500">Nenhum dado disponivel.</p>
}

function BarList({
  items,
  valueKey = 'total',
  label,
}: {
  items: Array<Record<string, any>>
  valueKey?: string
  label: (item: Record<string, any>) => string
}) {
  const max = Math.max(...items.map((item) => Number(item[valueKey] ?? 0)), 1)

  if (items.length === 0) return <EmptyState />

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const value = Number(item[valueKey] ?? 0)
        return (
          <div key={`${label(item)}-${index}`} className="grid grid-cols-[minmax(110px,1fr)_minmax(120px,2fr)_54px] items-center gap-3 text-sm">
            <span className="truncate text-zinc-300">{label(item)}</span>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
              />
            </div>
            <span className="text-right font-semibold tabular-nums text-zinc-100">{value}</span>
          </div>
        )
      })}
    </div>
  )
}

function TipoEscalaMatrix({ data }: { data: RelatorioAnalitico['por_tipo_escala'] }) {
  const tipos = useMemo(
    () => Array.from(new Set(data.map((item) => item.tipo_produto))).sort(),
    [data],
  )
  const byKey = useMemo(() => {
    const map = new Map<string, number>()
    data.forEach((item) => map.set(`${item.tipo_produto}|${item.escala}`, item.total))
    return map
  }, [data])

  if (data.length === 0) return <EmptyState />

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="py-2 pr-4 font-medium">Produto</th>
            {ESCALAS.map((escala) => (
              <th key={escala} className="px-3 py-2 text-right font-medium">{escala}</th>
            ))}
            <th className="py-2 pl-3 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {tipos.map((tipo) => {
            const total = ESCALAS.reduce((sum, escala) => sum + (byKey.get(`${tipo}|${escala}`) ?? 0), 0)
            return (
              <tr key={tipo} className="border-b border-white/5 last:border-0">
                <td className="py-3 pr-4 text-zinc-300">{produtoLabel(tipo)}</td>
                {ESCALAS.map((escala) => (
                  <td key={escala} className="px-3 py-3 text-right tabular-nums text-zinc-200">
                    {byKey.get(`${tipo}|${escala}`) ?? 0}
                  </td>
                ))}
                <td className="py-3 pl-3 text-right font-semibold tabular-nums text-zinc-100">{total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const TIPO_COLORS: Record<string, string> = {
  CARTA_TOPOGRAFICA: '#3b82f6',
  CARTA_ORTOIMAGEM: '#8b5cf6',
  ORTOIMAGEM: '#f59e0b',
  MDT: '#10b981',
  MDS: '#06b6d4',
  CDGV: '#f97316',
  IMPRESSAO_CT: '#ec4899',
  IMPRESSAO_COI: '#ec4899',
  IMPRESSAO: '#ec4899',
}

const ASC_COLORS: Record<number, string> = {
  1: '#ef4444',
  2: '#f59e0b',
  3: '#10b981',
  4: '#3b82f6',
  5: '#8b5cf6',
}

function RelatorioGeoLayer({ geojson }: { geojson: FeatureCollection }) {
  const map = useMap()

  useEffect(() => {
    const layer = L.geoJSON(geojson, {
      style: (feature) => {
        const tipo = feature?.properties?.tipo_produto as string
        const color = TIPO_COLORS[tipo] ?? '#94a3b8'
        return {
          color,
          fillColor: color,
          fillOpacity: 0.28,
          weight: 1.6,
        }
      },
      onEachFeature: (feature, lyr) => {
        const p = feature.properties ?? {}
        const tipo = produtoLabel(String(p.tipo_produto ?? ''))
        const tip = `
          <div style="min-width:180px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
              <strong style="color:#f4f4f5">${p.inom ?? '-'}</strong>
              <span style="color:#34d399;font-weight:700">#${p.pedido_id ?? '-'}</span>
            </div>
            ${p.mi ? `<div style="font-size:11px"><span style="color:#71717a">MI:</span> ${p.mi}</div>` : ''}
            <div style="font-size:11px"><span style="color:#71717a">ASC:</span> ${p.asc_label ?? '-'}</div>
            <div style="font-size:11px"><span style="color:#71717a">Produto:</span> ${tipo}</div>
            <div style="font-size:11px"><span style="color:#71717a">Escala:</span> ${p.escala ?? '-'}</div>
            <div style="font-size:11px"><span style="color:#71717a">Status:</span> ${statusLabel(String(p.status ?? ''))}</div>
            <div style="font-size:11px"><span style="color:#71717a">Solicitante:</span> ${p.usuario_nome ?? '-'}</div>
            ${p.usuario_om ? `<div style="font-size:11px"><span style="color:#71717a">OM:</span> ${p.usuario_om}</div>` : ''}
          </div>
        `
        lyr.bindTooltip(tip, { sticky: true, className: 'leaflet-dark-tooltip' })
      },
    }).addTo(map)

    const bounds = layer.getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28] })

    return () => {
      layer.remove()
    }
  }, [geojson, map])

  return null
}

function AscGeoLayer({ geojson }: { geojson: FeatureCollection }) {
  const map = useMap()

  useEffect(() => {
    const layer = L.geoJSON(geojson, {
      style: (feature) => {
        const cgeoId = Number(feature?.properties?.cgeo_id)
        const color = ASC_COLORS[cgeoId] ?? '#e4e4e7'
        return {
          color,
          fillColor: color,
          fillOpacity: 0.08,
          weight: 2.4,
          dashArray: '8 4',
        }
      },
      onEachFeature: (feature, lyr) => {
        const p = feature.properties ?? {}
        lyr.bindTooltip(`
          <div style="min-width:120px">
            <strong style="color:#f4f4f5">${p.label ?? 'ASC'}</strong>
            <div style="font-size:11px;color:#a1a1aa">${p.folhas ?? 0} folha${p.folhas === 1 ? '' : 's'} na grade ASC</div>
          </div>
        `, { sticky: true, className: 'leaflet-dark-tooltip' })
      },
    }).addTo(map)

    return () => {
      layer.remove()
    }
  }, [geojson, map])

  return null
}

function RelatorioGeralMap({ escopo, cgeoId }: { escopo: EscopoRelatorio; cgeoId: number | null }) {
  const [pedidosGeojson, setPedidosGeojson] = useState<FeatureCollection | null>(null)
  const [ascGeojson, setAscGeojson] = useState<FeatureCollection | null>(null)
  const [showAsc, setShowAsc] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      pedidosApi.relatorioAnaliticoFeatures({
        escopo,
        ...(cgeoId != null ? { cgeo_id: cgeoId } : {}),
      }),
      pedidosApi.relatorioAnaliticoAscFeatures(),
    ])
      .then(([pedidosRes, ascRes]) => {
        setPedidosGeojson(pedidosRes.data)
        setAscGeojson(ascRes.data)
      })
      .catch(() => toast.error('Erro ao carregar vista espacial'))
      .finally(() => setLoading(false))
  }, [cgeoId, escopo])

  const totalFeatures = pedidosGeojson?.features.length ?? 0
  const filteredAscGeojson = useMemo<FeatureCollection | null>(() => {
    if (!ascGeojson) return null
    if (cgeoId == null) return ascGeojson
    return {
      ...ascGeojson,
      features: ascGeojson.features.filter((feature) => Number(feature.properties?.cgeo_id) === cgeoId),
    }
  }, [ascGeojson, cgeoId])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-zinc-500">
          {totalFeatures} produto{totalFeatures !== 1 ? 's' : ''} espacializado{totalFeatures !== 1 ? 's' : ''}
        </div>
        <label className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-zinc-950/60 px-3 py-1.5 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={showAsc}
            onChange={(event) => setShowAsc(event.target.checked)}
            className="h-3.5 w-3.5 accent-emerald-500"
          />
          ASC
        </label>
      </div>

      {loading ? (
        <div className="flex h-[420px] items-center justify-center rounded-lg border border-white/10">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        </div>
      ) : pedidosGeojson && pedidosGeojson.features.length > 0 ? (
        <div className="h-[420px] overflow-hidden rounded-lg border border-white/10">
          <MapContainer
            center={[-15, -52]}
            zoom={5}
            style={{ height: '100%', width: '100%', background: '#18181b' }}
            zoomControl
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            {showAsc && filteredAscGeojson && <AscGeoLayer geojson={filteredAscGeojson} />}
            <RelatorioGeoLayer geojson={pedidosGeojson} />
          </MapContainer>
        </div>
      ) : (
        <div className="flex h-[420px] items-center justify-center rounded-lg border border-white/10 text-sm text-zinc-500">
          Nenhuma geometria disponivel para os pedidos deste escopo.
        </div>
      )}
    </div>
  )
}

type AscResumo = RelatorioAnalitico['por_asc'][number]

function RelatorioAscMapModal({
  asc,
  escopo,
  onClose,
}: {
  asc: AscResumo
  escopo: EscopoRelatorio
  onClose: () => void
}) {
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    pedidosApi.relatorioAnaliticoFeatures({
      escopo,
      ...(asc.cgeo_id == null ? { sem_asc: true } : { cgeo_id: asc.cgeo_id }),
    })
      .then((res) => setGeojson(res.data))
      .catch(() => toast.error('Erro ao carregar pedidos no mapa'))
      .finally(() => setLoading(false))
  }, [asc.cgeo_id, escopo])

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg border border-white/10 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">{asc.label} - Ver espacialmente</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {asc.pedidos} pedido{asc.pedidos !== 1 ? 's' : ''} e {asc.itens} produto{asc.itens !== 1 ? 's' : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 p-5">
          {loading ? (
            <div className="flex h-[520px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
            </div>
          ) : geojson && geojson.features.length > 0 ? (
            <div className="h-[520px] overflow-hidden rounded-lg border border-white/10">
              <MapContainer
                center={[-15, -52]}
                zoom={5}
                style={{ height: '100%', width: '100%', background: '#18181b' }}
                zoomControl
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                />
                <RelatorioGeoLayer geojson={geojson} />
              </MapContainer>
            </div>
          ) : (
            <div className="flex h-[520px] items-center justify-center rounded-lg border border-white/10 text-sm text-zinc-500">
              Nenhuma geometria disponivel para esta ASC.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function Relatorios() {
  const [relatorio, setRelatorio] = useState<RelatorioAnalitico | null>(null)
  const [selectedAsc, setSelectedAsc] = useState('')
  const [escopo, setEscopo] = useState<EscopoRelatorio>('todos')
  const [mapAsc, setMapAsc] = useState<AscResumo | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const params = {
        escopo,
        ...(selectedAsc ? { cgeo_id: Number(selectedAsc) } : {}),
      }
      const response = await pedidosApi.relatorioAnalitico(params)
      setRelatorio(response.data)
    } catch {
      toast.error('Erro ao carregar relatorios')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [escopo, selectedAsc])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <LoadingSpinner />

  const pedidosComAsc = relatorio?.por_asc
    .filter((asc) => asc.cgeo_id !== null)
    .reduce((sum, asc) => sum + asc.pedidos, 0) ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Relatorios</h1>
          <p className="mt-1 text-sm text-zinc-500">Analise por ASC prevista na grade oficial Grid_MI.</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
            <ClipboardList className="h-4 w-4 text-zinc-500" />
            <select
              value={escopo}
              onChange={(event) => setEscopo(event.target.value as EscopoRelatorio)}
              className="bg-transparent text-sm text-zinc-100 outline-none"
            >
              {ESCOPO_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-zinc-900">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
            <Filter className="h-4 w-4 text-zinc-500" />
            <select
              value={selectedAsc}
              onChange={(event) => setSelectedAsc(event.target.value)}
              className="bg-transparent text-sm text-zinc-100 outline-none"
            >
              {ASC_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value} className="bg-zinc-900">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={load}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/5 disabled:opacity-60"
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card icon={<ClipboardList className="h-5 w-5" />} label="Pedidos" value={relatorio?.totais.pedidos ?? 0} sub={relatorio?.filtro.escopo_label ?? 'Todos os pedidos'} />
        <Card icon={<Boxes className="h-5 w-5" />} label="Produtos" value={relatorio?.totais.itens ?? 0} sub="Itens validos solicitados" />
        <Card icon={<MapPinned className="h-5 w-5" />} label="Pedidos com ASC" value={pedidosComAsc} sub={relatorio?.filtro.cgeo_label ?? 'Todas as ASC'} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Pedidos destinados a cada ASC" right={<BarChart2 className="h-4 w-4 text-zinc-500" />}>
          <div className="space-y-3">
            {(relatorio?.por_asc ?? []).map((asc) => {
              const max = Math.max(...(relatorio?.por_asc ?? []).map((item) => item.pedidos), 1)
              return (
                <button
                  key={asc.label}
                  type="button"
                  onClick={() => setMapAsc(asc)}
                  disabled={asc.itens === 0}
                  className="grid w-full grid-cols-[108px_1fr_74px_74px_28px] items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                  title={asc.itens > 0 ? `Ver espacialmente ${asc.label}` : 'Sem produtos para espacializar'}
                >
                  <span className="text-zinc-300">{asc.label}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(4, (asc.pedidos / max) * 100)}%` }} />
                  </div>
                  <span className="text-right tabular-nums text-zinc-100">{asc.pedidos} ped.</span>
                  <span className="text-right tabular-nums text-zinc-400">{asc.itens} prod.</span>
                  <MapPinned className="h-4 w-4 justify-self-end text-zinc-500" />
                </button>
              )
            })}
          </div>
        </Panel>

        <Panel title="Produtos solicitados">
          <BarList items={relatorio?.por_tipo ?? []} label={(item) => produtoLabel(item.tipo_produto)} />
        </Panel>

        <Panel title="Produtos por escala">
          <TipoEscalaMatrix data={relatorio?.por_tipo_escala ?? []} />
        </Panel>

        <Panel title="Distribuicao por status">
          <BarList items={relatorio?.por_status ?? []} label={(item) => statusLabel(item.status)} />
        </Panel>

        <Panel title="Totais por escala">
          <BarList items={relatorio?.por_escala ?? []} label={(item) => item.escala} />
        </Panel>

        <Panel title="Vista espacial geral" className="xl:col-span-2" right={<MapPinned className="h-4 w-4 text-zinc-500" />}>
          <RelatorioGeralMap
            escopo={escopo}
            cgeoId={selectedAsc ? Number(selectedAsc) : null}
          />
        </Panel>

        <Panel title="Folhas e produtos mais pedidos">
          {(relatorio?.produtos_mais_pedidos.length ?? 0) === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="py-2 pr-3 font-medium">INOM</th>
                    <th className="px-3 py-2 font-medium">MI</th>
                    <th className="px-3 py-2 font-medium">Produto</th>
                    <th className="px-3 py-2 font-medium">Escala</th>
                    <th className="py-2 pl-3 text-right font-medium">Qtd.</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio?.produtos_mais_pedidos.map((produto) => (
                    <tr key={`${produto.inom}-${produto.mi}-${produto.tipo_produto}-${produto.escala}`} className="border-b border-white/5 last:border-0">
                      <td className="py-3 pr-3 font-medium text-zinc-200">{produto.inom}</td>
                      <td className="px-3 py-3 text-zinc-400">{produto.mi ?? '-'}</td>
                      <td className="px-3 py-3 text-zinc-300">{produtoLabel(produto.tipo_produto)}</td>
                      <td className="px-3 py-3 text-zinc-400">{produto.escala}</td>
                      <td className="py-3 pl-3 text-right font-semibold tabular-nums text-zinc-100">{produto.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {mapAsc && (
        <RelatorioAscMapModal
          asc={mapAsc}
          escopo={escopo}
          onClose={() => setMapAsc(null)}
        />
      )}
    </div>
  )
}
