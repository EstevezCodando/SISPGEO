import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { format, isBefore, isAfter } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Trash2, CalendarDays, CheckCircle, Clock, XCircle, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import api from '../../api/client'

interface Janela {
  id: number
  tipo_janela: string
  data_inicio: string
  data_fim: string
  ano_referencia: number
}

/** Grupos do ciclo anual — ordem cronológica */
const GRUPOS = [
  {
    tipo: 'SOLICITANTE',
    label: 'Organizações Militares (OM)',
    sublabel: 'Solicitantes (OMDS) realizam as solicitações de produtos geoespaciais',
    periodo: 'Mai — Jun',
    meses: [4, 5],   // 0-indexed
    cor: 'emerald',
    defaults: { start: '-05-20', end: '-06-30' },
    restricao: null,
  },
  {
    tipo: 'SUPERVISOR',
    label: 'Supervisores (C. Mil. A)',
    sublabel: 'Supervisores recebem, organizam e complementam os pedidos das OMs',
    periodo: 'Julho',
    meses: [6],
    cor: 'sky',
    defaults: { start: '-07-02', end: '-07-31' },
    restricao: 'Deve iniciar ao menos 1 dia após o encerramento da janela de Solicitantes',
  },
  {
    tipo: 'CONSOLIDADOR',
    label: 'Consolidadores (COTER)',
    sublabel: 'Consolidadores validam e encaminham à DSG com prioridades definidas',
    periodo: 'Agosto',
    meses: [7],
    cor: 'amber',
    defaults: { start: '-08-02', end: '-08-31' },
    restricao: 'Deve iniciar ao menos 1 dia após o encerramento da janela de Supervisores',
  },
  {
    tipo: 'GESTOR_CARTOGRAFICO',
    label: 'DSG — Recebimento',
    sublabel: 'DSG recebe pedidos consolidados do COTER',
    periodo: 'Set',
    meses: [8],
    cor: 'blue',
    defaults: { start: '-09-01', end: '-09-15' },
    restricao: 'Deve iniciar ao menos 1 dia após o encerramento da janela de Consolidadores',
  },
  {
    tipo: 'ANALISTA_CGEO',
    label: 'DSG — Distribuição às CGEOs',
    sublabel: 'DSG distribui pedidos às CGEOs para análise de capacidade',
    periodo: 'Set',
    meses: [8],
    cor: 'purple',
    defaults: { start: '-09-02', end: '-09-30' },
    restricao: null,
  },
  {
    tipo: 'GESTOR_CARTOGRAFICO_FINAL',
    label: 'DSG — Análise e Resposta às OMs',
    sublabel: 'CGEOs analisam; DSG comunica resultado às OMs',
    periodo: 'Out',
    meses: [9],
    cor: 'orange',
    defaults: { start: '-10-01', end: '-10-31' },
    restricao: null,
  },
] as const

type GrupoTipo = typeof GRUPOS[number]['tipo']

const COR: Record<string, { badge: string; ring: string; dot: string; btn: string }> = {
  emerald: {
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    ring:  'ring-emerald-500/30',
    dot:   'bg-emerald-400',
    btn:   'bg-emerald-500 hover:bg-emerald-400',
  },
  sky: {
    badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    ring:  'ring-sky-500/30',
    dot:   'bg-sky-400',
    btn:   'bg-sky-500 hover:bg-sky-400',
  },
  amber: {
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    ring:  'ring-amber-500/30',
    dot:   'bg-amber-400',
    btn:   'bg-amber-500 hover:bg-amber-400',
  },
  blue: {
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    ring:  'ring-blue-500/30',
    dot:   'bg-blue-400',
    btn:   'bg-blue-500 hover:bg-blue-400',
  },
  purple: {
    badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    ring:  'ring-purple-500/30',
    dot:   'bg-purple-400',
    btn:   'bg-purple-500 hover:bg-purple-400',
  },
  orange: {
    badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    ring:  'ring-orange-500/30',
    dot:   'bg-orange-400',
    btn:   'bg-orange-500 hover:bg-orange-400',
  },
}

function janelaStatus(j: Janela): 'active' | 'upcoming' | 'expired' {
  const now = new Date()
  if (isBefore(now, new Date(j.data_inicio))) return 'upcoming'
  if (isAfter(now, new Date(j.data_fim))) return 'expired'
  return 'active'
}

const StatusIcon = ({ status }: { status: ReturnType<typeof janelaStatus> }) => {
  if (status === 'active')   return <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
  if (status === 'upcoming') return <Clock className="h-3.5 w-3.5 text-amber-400" />
  return <XCircle className="h-3.5 w-3.5 text-zinc-500" />
}

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors'

interface FormState {
  data_inicio: string
  data_fim: string
  ano_referencia: number
}

export function JanelasPedidos() {
  const [janelas, setJanelas] = useState<Janela[]>([])
  const [expanded, setExpanded] = useState<GrupoTipo | null>(null)
  const [forms, setForms] = useState<Record<GrupoTipo, FormState>>(() => {
    const ano = new Date().getFullYear() + 1
    return Object.fromEntries(
      GRUPOS.map((g) => [g.tipo, {
        data_inicio: `${ano}${g.defaults.start}T00:00`,
        data_fim:    `${ano}${g.defaults.end}T23:59`,
        ano_referencia: ano,
      }])
    ) as Record<GrupoTipo, FormState>
  })
  const [saving, setSaving] = useState<GrupoTipo | null>(null)

  const load = () => {
    api.get<Janela[]>('/janelas/').then((r) => setJanelas(r.data)).catch(() => {})
  }

  useEffect(load, [])

  const janelasPorGrupo = (tipo: GrupoTipo) =>
    janelas.filter((j) => j.tipo_janela === tipo).sort((a, b) => b.ano_referencia - a.ano_referencia)

  const handleCreate = async (tipo: GrupoTipo) => {
    setSaving(tipo)
    const f = forms[tipo]
    try {
      await api.post('/janelas/', {
        tipo_janela: tipo,
        data_inicio: new Date(f.data_inicio).toISOString(),
        data_fim:    new Date(f.data_fim).toISOString(),
        ano_referencia: f.ano_referencia,
      })
      toast.success('Janela criada com sucesso')
      load()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao criar janela')
    } finally {
      setSaving(null)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/janelas/${id}`)
      toast.success('Janela removida')
      load()
    } catch {
      toast.error('Erro ao remover janela')
    }
  }

  const updateForm = (tipo: GrupoTipo, field: keyof FormState, value: string | number) =>
    setForms((prev) => ({ ...prev, [tipo]: { ...prev[tipo], [field]: value } }))

  // Active window per group
  const activeByGrupo = (tipo: GrupoTipo) =>
    janelasPorGrupo(tipo).find((j) => janelaStatus(j) === 'active')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Janelas de Pedidos</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Gerencie os períodos de recebimento de pedidos para cada nível da cadeia de comando.
          Todos os pedidos devem estar consolidados até agosto para o parecer da DSG.
        </p>
      </div>

      {/* Ciclo anual — resumo visual */}
      <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-emerald-400" />
          Ciclo Anual de Pedidos
        </h2>
        <div className="relative flex items-start gap-0">
          {GRUPOS.map((g, i) => {
            const active = activeByGrupo(g.tipo as GrupoTipo)
            const c = COR[g.cor]
            return (
              <div key={g.tipo} className="flex-1 flex flex-col items-center">
                {/* Linha conectora */}
                <div className="w-full flex items-center">
                  {i > 0 && <div className="flex-1 h-px bg-zinc-700" />}
                  <div className={`w-3 h-3 rounded-full shrink-0 ${active ? c.dot : 'bg-zinc-600'} ${active ? `ring-2 ring-offset-2 ring-offset-zinc-900 ${c.ring}` : ''}`} />
                  {i < GRUPOS.length - 1 && <div className="flex-1 h-px bg-zinc-700" />}
                </div>
                {/* Etiqueta */}
                <div className="text-center mt-2 px-1">
                  <p className={`text-xs font-semibold ${active ? 'text-zinc-100' : 'text-zinc-500'}`}>{g.label}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{g.periodo}</p>
                  {active && (
                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      ativo
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-zinc-600 mt-4 text-center">
          → Todos os pedidos consolidados até agosto para análise e parecer da DSG
        </p>
      </div>

      {/* Cards de gestão por grupo */}
      <div className="space-y-3">
        {GRUPOS.map((g) => {
          const tipo = g.tipo as GrupoTipo
          const c = COR[g.cor]
          const grupoJanelas = janelasPorGrupo(tipo)
          const isOpen = expanded === tipo

          return (
            <div key={tipo} className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
              {/* Header do grupo */}
              <button
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors text-left"
                onClick={() => setExpanded(isOpen ? null : tipo)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${c.dot}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-100 text-sm">{g.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${c.badge}`}>{g.periodo}</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{g.sublabel}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Status das janelas existentes */}
                  <div className="flex items-center gap-1.5">
                    {grupoJanelas.slice(0, 3).map((j) => {
                      const st = janelaStatus(j)
                      return (
                        <div key={j.id} className="flex items-center gap-1 text-xs text-zinc-500">
                          <StatusIcon status={st} />
                          <span>{j.ano_referencia}</span>
                        </div>
                      )
                    })}
                    {grupoJanelas.length === 0 && (
                      <span className="text-xs text-zinc-600">Nenhuma janela configurada</span>
                    )}
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
                </div>
              </button>

              {/* Conteúdo expandido */}
              {isOpen && (
                <div className="border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-white/5">
                  {/* Formulário de criação */}
                  <div className="p-5">
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Nova Janela</h3>
                    {g.restricao && (
                      <div className="flex items-start gap-2 mb-3 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-300/80">{g.restricao}</p>
                      </div>
                    )}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Ano de referência</label>
                        <input
                          type="number"
                          value={forms[tipo].ano_referencia}
                          onChange={(e) => {
                            const ano = Number(e.target.value)
                            updateForm(tipo, 'ano_referencia', ano)
                            updateForm(tipo, 'data_inicio', `${ano}${g.defaults.start}T00:00`)
                            updateForm(tipo, 'data_fim', `${ano}${g.defaults.end}T23:59`)
                          }}
                          className={inputCls}
                          min={2024}
                          max={2040}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-zinc-400 mb-1">Abertura</label>
                          <input
                            type="datetime-local"
                            value={forms[tipo].data_inicio}
                            onChange={(e) => updateForm(tipo, 'data_inicio', e.target.value)}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-400 mb-1">Encerramento</label>
                          <input
                            type="datetime-local"
                            value={forms[tipo].data_fim}
                            onChange={(e) => updateForm(tipo, 'data_fim', e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => handleCreate(tipo)}
                        disabled={saving === tipo}
                        className={`w-full flex items-center justify-center gap-1.5 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${c.btn}`}
                      >
                        <Plus className="h-4 w-4" />
                        {saving === tipo ? 'Salvando...' : 'Criar janela'}
                      </button>
                    </div>
                  </div>

                  {/* Janelas existentes */}
                  <div className="p-5">
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
                      Janelas Configuradas {grupoJanelas.length > 0 && `(${grupoJanelas.length})`}
                    </h3>
                    {grupoJanelas.length === 0 ? (
                      <p className="text-xs text-zinc-600 italic">Nenhuma janela cadastrada para este grupo.</p>
                    ) : (
                      <div className="space-y-2">
                        {grupoJanelas.map((j) => {
                          const st = janelaStatus(j)
                          return (
                            <div key={j.id} className={`flex items-start justify-between rounded-lg p-3 border text-xs gap-3 ${
                              st === 'active'   ? 'bg-emerald-500/5 border-emerald-500/20' :
                              st === 'upcoming' ? 'bg-amber-500/5 border-amber-500/10' :
                                                  'bg-zinc-800/40 border-white/5'
                            }`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <StatusIcon status={st} />
                                  <span className={`font-semibold ${
                                    st === 'active' ? 'text-emerald-300' :
                                    st === 'upcoming' ? 'text-amber-300' : 'text-zinc-500'
                                  }`}>
                                    {j.ano_referencia} — {st === 'active' ? 'Em aberto' : st === 'upcoming' ? 'Próxima' : 'Encerrada'}
                                  </span>
                                </div>
                                <p className="text-zinc-500">
                                  {format(new Date(j.data_inicio), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                </p>
                                <p className="text-zinc-500">
                                  até {format(new Date(j.data_fim), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                </p>
                              </div>
                              <button
                                onClick={() => handleDelete(j.id)}
                                className="text-zinc-600 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                                title="Remover janela"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Nota sobre o ciclo */}
      <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4 text-xs text-zinc-500 leading-relaxed space-y-1">
        <p className="font-medium text-zinc-400">Regras do ciclo anual (configuração inicial 2026):</p>
        <ul className="list-disc list-inside space-y-0.5 ml-1">
          <li>As OMs (Solicitantes) realizam solicitações de <strong className="text-zinc-300">20 de maio a 30 de junho</strong></li>
          <li>Em <strong className="text-zinc-300">1º de julho</strong> todos os pedidos RASCUNHO são enviados automaticamente ao Supervisor</li>
          <li>Os Supervisores (C. Mil. A) organizam de <strong className="text-zinc-300">2 a 31 de julho</strong></li>
          <li>Em <strong className="text-zinc-300">1º de agosto</strong> todos os pedidos são enviados automaticamente ao Consolidador</li>
          <li>Os Consolidadores (COTER) encaminham à DSG de <strong className="text-zinc-300">2 a 31 de agosto</strong></li>
          <li>Em <strong className="text-zinc-300">1º de setembro</strong> a DSG recebe todos os pedidos para análise e distribuição às CGEOs</li>
          <li>A janela de cada etapa deve iniciar ao menos <strong className="text-zinc-300">1 dia</strong> após o encerramento da etapa anterior</li>
        </ul>
      </div>
    </div>
  )
}
