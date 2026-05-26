import { useEffect, useState, useCallback } from 'react'
import { metricasApi, ResumoMetricas, EndpointMetrica, PedidosMetricas } from '../../api/metricas'
import { Activity, Zap, AlertTriangle, Server, RefreshCw, Clock } from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  RASCUNHO: 'bg-zinc-500',
  AGUARDANDO_SUPERVISOR: 'bg-blue-500',
  AGUARDANDO_CONSOLIDADOR: 'bg-indigo-500',
  AGUARDANDO_CARTOGRAFICO: 'bg-violet-500',
  ATRIBUIDO_CGEO: 'bg-amber-500',
  APROVADO: 'bg-emerald-500',
  REPROVADO: 'bg-red-500',
  CANCELADO: 'bg-zinc-600',
  PRODUZIDO: 'bg-teal-500',
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  AGUARDANDO_SUPERVISOR: 'Aguard. Supervisor',
  AGUARDANDO_CONSOLIDADOR: 'Aguard. Consolidador',
  AGUARDANDO_CARTOGRAFICO: 'Aguard. DSG',
  ATRIBUIDO_CGEO: 'Em Análise CGEO',
  APROVADO: 'Aprovado',
  REPROVADO: 'Reprovado',
  CANCELADO: 'Cancelado',
  PRODUZIDO: 'Produzido',
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  POST: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PUT: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
  PATCH: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span className={`inline-block text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${METHOD_COLORS[method] ?? 'bg-zinc-700 text-zinc-300 border-zinc-600'}`}>
      {method}
    </span>
  )
}

function Card({ icon, label, value, sub, color = 'emerald' }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string
}) {
  const ring = {
    emerald: 'border-emerald-500/20 bg-emerald-500/5',
    blue: 'border-blue-500/20 bg-blue-500/5',
    amber: 'border-amber-500/20 bg-amber-500/5',
    red: 'border-red-500/20 bg-red-500/5',
  }[color] ?? 'border-white/10 bg-zinc-800'

  const text = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
  }[color] ?? 'text-zinc-100'

  return (
    <div className={`rounded-xl border p-5 flex flex-col gap-1 ${ring}`}>
      <div className={`${text} mb-1`}>{icon}</div>
      <div className="text-2xl font-bold text-zinc-100">{value}</div>
      <div className="text-sm text-zinc-400">{label}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  )
}

// ─── Gráfico de barras SVG inline (sem lib externa) ──────────────────────────

function BarChart({ data }: { data: { label: string; value: number; erros: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  const H = 100
  const barW = Math.max(4, Math.floor(560 / Math.max(data.length, 1)) - 2)

  return (
    <svg viewBox={`0 0 600 ${H + 24}`} className="w-full" preserveAspectRatio="none">
      {data.map((d, i) => {
        const h = Math.round((d.value / max) * H)
        const he = Math.round((d.erros / max) * H)
        const x = i * (barW + 2) + 4
        const y = H - h
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} rx="2"
              className="fill-emerald-500/60" />
            {he > 0 && (
              <rect x={x} y={H - he} width={barW} height={he} rx="2"
                className="fill-red-500/70" />
            )}
            <title>{`${d.label}: ${d.value} req (${d.erros} erros)`}</title>
          </g>
        )
      })}
      {/* Eixo X — hora de início e fim */}
      {data.length > 0 && (
        <>
          <text x={4} y={H + 18} className="fill-zinc-500" style={{ fontSize: 9 }}>
            {data[0]?.label?.slice(11, 16)}
          </text>
          <text x={600 - 24} y={H + 18} textAnchor="end" className="fill-zinc-500" style={{ fontSize: 9 }}>
            {data[data.length - 1]?.label?.slice(11, 16)}
          </text>
        </>
      )}
    </svg>
  )
}

// ─── Donut chart simples ──────────────────────────────────────────────────────

function DonutChart({ items }: { items: { label: string; count: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + i.count, 0) || 1
  let offset = 0
  const R = 40, CX = 52, CY = 52, STROKE = 18
  const circumference = 2 * Math.PI * R

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 104 104" className="w-24 h-24 shrink-0 -rotate-90">
        {items.map((item, i) => {
          const pct = item.count / total
          const dash = pct * circumference
          const gap = circumference - dash
          const seg = (
            <circle key={i} cx={CX} cy={CY} r={R}
              fill="none" strokeWidth={STROKE}
              stroke={item.color}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset * circumference}
            />
          )
          offset += pct
          return seg
        })}
      </svg>
      <ul className="space-y-1 text-xs min-w-0">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 truncate">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-zinc-400 truncate">{item.label}</span>
            <span className="text-zinc-200 font-medium ml-auto pl-1">{item.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

const STATUS_DONUT_COLORS = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#ef4444', '#6b7280', '#14b8a6', '#f97316',
]

export function ApiMetricas() {
  const [resumo, setResumo] = useState<ResumoMetricas | null>(null)
  const [endpoints, setEndpoints] = useState<EndpointMetrica[]>([])
  const [pedidos, setPedidos] = useState<PedidosMetricas | null>(null)
  const [janela, setJanela] = useState(24)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, e, p] = await Promise.all([
        metricasApi.resumo(),
        metricasApi.api(janela),
        metricasApi.pedidos(),
      ])
      setResumo(r.data)
      setEndpoints(e.data)
      setPedidos(p.data)
      setLastUpdate(new Date())
    } catch {
      // silencioso — página mostra estado vazio
    } finally {
      setLoading(false)
    }
  }, [janela])

  useEffect(() => { load() }, [load])

  const errorRate = resumo ? (resumo.error_rate_24h * 100).toFixed(2) : '–'
  const barData = (resumo?.requests_por_hora ?? []).map(h => ({
    label: h.hora,
    value: h.total,
    erros: h.erros,
  }))

  const donutItems = (pedidos?.pedidos_por_status ?? []).map((s, i) => ({
    label: STATUS_LABEL[s.status] ?? s.status,
    count: s.count,
    color: STATUS_DONUT_COLORS[i % STATUS_DONUT_COLORS.length],
  }))

  return (
    <div className="p-6 space-y-6 max-w-7xl">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Métricas da API</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Monitoramento de performance e volume — atualizado em tempo real
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastUpdate.toLocaleTimeString('pt-BR')}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-zinc-800 border border-white/10 text-zinc-300 hover:text-zinc-100 hover:border-white/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          icon={<Activity className="h-5 w-5" />}
          label="Requisições (24h)"
          value={resumo?.total_requests_24h.toLocaleString('pt-BR') ?? '–'}
          color="emerald"
        />
        <Card
          icon={<Zap className="h-5 w-5" />}
          label="Latência média"
          value={resumo ? `${resumo.avg_response_ms} ms` : '–'}
          sub="Tempo médio de resposta"
          color="blue"
        />
        <Card
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Taxa de erros"
          value={`${errorRate}%`}
          sub="Status ≥ 500"
          color={Number(errorRate) > 1 ? 'red' : 'amber'}
        />
        <Card
          icon={<Server className="h-5 w-5" />}
          label="Endpoints ativos"
          value={resumo?.endpoints_ativos ?? '–'}
          sub={`${resumo?.total_pedidos ?? 0} pedidos no sistema`}
          color="emerald"
        />
      </div>

      {/* Gráfico de barras + pedidos por status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-white/10 bg-zinc-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-zinc-300">Requisições por hora (últimas 24h)</h2>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500/60 inline-block"/>Total</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/70 inline-block"/>Erros</span>
            </div>
          </div>
          {barData.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">Nenhum dado ainda</p>
          ) : (
            <BarChart data={barData} />
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-zinc-900 p-5">
          <h2 className="text-sm font-medium text-zinc-300 mb-4">Pedidos por status</h2>
          {donutItems.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">Sem pedidos</p>
          ) : (
            <DonutChart items={donutItems} />
          )}
        </div>
      </div>

      {/* Tabela de endpoints */}
      <div className="rounded-xl border border-white/10 bg-zinc-900">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-sm font-medium text-zinc-300">Breakdown por endpoint</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Janela:</span>
            {([1, 6, 24, 48, 168] as const).map(h => (
              <button
                key={h}
                onClick={() => setJanela(h)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  janela === h
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {h >= 168 ? '7d' : h >= 48 ? '2d' : h >= 24 ? '24h' : `${h}h`}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 border-b border-white/5">
                <th className="text-left px-5 py-3 font-medium">Endpoint</th>
                <th className="text-right px-4 py-3 font-medium">Req.</th>
                <th className="text-right px-4 py-3 font-medium">Avg (ms)</th>
                <th className="text-right px-4 py-3 font-medium">P95 (ms)</th>
                <th className="text-right px-4 py-3 font-medium">Erros</th>
                <th className="text-right px-4 py-3 font-medium">Taxa erro</th>
                <th className="text-right px-5 py-3 font-medium">Última chamada</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-zinc-500 py-10">
                    {loading ? 'Carregando…' : 'Nenhum dado no período selecionado'}
                  </td>
                </tr>
              ) : (
                endpoints.map((ep, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <MethodBadge method={ep.method} />
                        <span className="font-mono text-xs text-zinc-300 truncate max-w-xs">{ep.endpoint}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-200 font-medium">{ep.total_requests.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={ep.avg_duration_ms > 500 ? 'text-amber-400' : ep.avg_duration_ms > 1000 ? 'text-red-400' : 'text-zinc-300'}>
                        {ep.avg_duration_ms.toFixed(0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={ep.p95_duration_ms > 1000 ? 'text-red-400' : 'text-zinc-400'}>
                        {ep.p95_duration_ms.toFixed(0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400">{ep.error_count}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={ep.error_rate > 0.05 ? 'text-red-400' : ep.error_rate > 0.01 ? 'text-amber-400' : 'text-emerald-400'}>
                        {(ep.error_rate * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-500 text-xs">
                      {ep.last_called ? new Date(ep.last_called).toLocaleString('pt-BR') : '–'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pedidos por órgão vinculante + evolução mensal */}
      {pedidos && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-zinc-900 p-5">
            <h2 className="text-sm font-medium text-zinc-300 mb-4">Pedidos por órgão vinculante</h2>
            <div className="space-y-3">
              {pedidos.pedidos_por_orgao_vinculante.map((d, i) => {
                const pct = pedidos.total_pedidos ? (d.count / pedidos.total_pedidos) * 100 : 0
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-400">{d.orgao_vinculante}</span>
                      <span className="text-zinc-300 font-medium">{d.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800">
                      <div
                        className="h-1.5 rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            {pedidos.tempo_medio_tramitacao_horas != null && (
              <div className="mt-4 pt-4 border-t border-white/10 text-sm">
                <span className="text-zinc-500">Tempo médio de tramitação: </span>
                <span className="text-zinc-200 font-medium">
                  {pedidos.tempo_medio_tramitacao_horas >= 24
                    ? `${(pedidos.tempo_medio_tramitacao_horas / 24).toFixed(1)} dias`
                    : `${pedidos.tempo_medio_tramitacao_horas.toFixed(0)} horas`}
                </span>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-zinc-900 p-5">
            <h2 className="text-sm font-medium text-zinc-300 mb-4">Evolução mensal (12 meses)</h2>
            {pedidos.evolucao_mensal.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">Sem dados mensais ainda</p>
            ) : (() => {
              const maxV = Math.max(...pedidos.evolucao_mensal.map(m => m.count), 1)
              return (
                <div className="flex items-end gap-1 h-28">
                  {pedidos.evolucao_mensal.map((m, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                      <div
                        title={`${m.mes}: ${m.count}`}
                        className="w-full bg-emerald-500/50 hover:bg-emerald-500 rounded-t transition-colors cursor-default"
                        style={{ height: `${Math.round((m.count / maxV) * 96)}px` }}
                      />
                      <span className="text-zinc-600 text-[9px] group-hover:text-zinc-400">
                        {m.mes.slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
