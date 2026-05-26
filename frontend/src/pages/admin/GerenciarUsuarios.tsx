import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ArrowRightLeft, X, History, ChevronDown, ChevronUp,
  Mail, Phone, Building2, MapPin, ShieldCheck, ShieldOff,
  AlertTriangle, Clock, CheckCircle2, XCircle, Users, Search,
} from 'lucide-react'
import { usersApi } from '../../api/users'
import type { Transferencia } from '../../api/users'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import type { Usuario, Perfil } from '../../types/user'
import { PERFIL_LABELS } from '../../types/user'
import { formatNomeComPosto } from '../../data/postos'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERFIL_GROUPS: { label: string; perfis: Perfil[] }[] = [
  { label: 'Solicitante', perfis: ['SOLICITANTE'] },
  {
    label: 'Supervisores Regionais (COTER)',
    perfis: [
      'SUPERVISOR_CMP', 'SUPERVISOR_CML', 'SUPERVISOR_CMS', 'SUPERVISOR_CMO',
      'SUPERVISOR_CMAO', 'SUPERVISOR_CMA', 'SUPERVISOR_CMNE', 'SUPERVISOR_CMSE',
    ],
  },
  {
    label: 'Consolidadores por Órgão',
    perfis: ['CONSOLIDADOR_COTER', 'CONSOLIDADOR_DSG', 'CONSOLIDADOR_DEC', 'CONSOLIDADOR_COLOG', 'CONSOLIDADOR_DECEX'],
  },
  { label: 'DSG / CGEO', perfis: ['GESTOR_CARTOGRAFICO', 'ANALISTA_CGEO'] },
]

/** Descreve a posição do usuário no fluxo de aprovação. */
function fluxoLabel(u: Usuario): string {
  const p = u.perfil
  const o = u.orgao_vinculante ?? '?'
  const r = u.regiao_militar ?? '?'

  if (p === 'SOLICITANTE') {
    if (o === 'COTER')
      return `SOLICITANTE → Supervisor ${r} → Consolidador COTER → DSG → CGEO`
    return `SOLICITANTE → Consolidador ${o} → DSG → CGEO`
  }
  if (p.startsWith('SUPERVISOR_'))
    return `Supervisor ${r} recebe de SOLICITANTEs da região → encaminha ao Consolidador COTER`
  if (p.startsWith('CONSOLIDADOR_'))
    return `Consolidador ${o} recebe pedidos aprovados → encaminha à DSG`
  if (p === 'GESTOR_CARTOGRAFICO')
    return 'DSG — atribui pedidos ao CGEO e controla janelas temporais'
  if (p === 'ANALISTA_CGEO')
    return `CGEO (ID ${u.cgeo_id ?? '?'}) — analisa viabilidade e disponibiliza produtos no BDGEx`
  return '—'
}

function fmt(v?: string | null) {
  if (!v) return '—'
  try { return format(new Date(v), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) } catch { return v }
}

// ─── Modal de histórico ───────────────────────────────────────────────────────
function HistoricoModal({ user, onClose }: { user: Usuario; onClose: () => void }) {
  const [transferencias, setTransferencias] = useState<Transferencia[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    usersApi.getUsuarioTransferencias(user.id)
      .then((r) => setTransferencias(r.data))
      .catch(() => toast.error('Erro ao carregar histórico'))
      .finally(() => setLoading(false))
  }, [user.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Histórico de Transferências</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{user.nome} · {user.om}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 max-h-96 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-zinc-500 text-center">Carregando…</p>
          ) : transferencias.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center italic">Nenhuma transferência registrada.</p>
          ) : (
            <div className="space-y-3">
              {transferencias.map((t) => (
                <div key={t.id} className="bg-zinc-800 border border-zinc-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <span className="font-mono text-zinc-400">Pedido #{t.pedido_id}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-500">{fmt(t.transferido_em)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-400">{t.de_usuario_nome ?? '—'}</span>
                    <ArrowRightLeft className="h-3 w-3 text-amber-400" />
                    <span className="text-emerald-400 font-medium">{t.para_usuario_nome ?? '—'}</span>
                  </div>
                  {t.observacao && <p className="text-[10px] text-zinc-500 mt-1 italic">{t.observacao}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-6 pt-0">
          <button onClick={onClose} className="w-full px-4 py-2 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de transferência ───────────────────────────────────────────────────
interface TransferModalProps {
  source: Usuario
  allUsers: Usuario[]
  onClose: () => void
}
function TransferModal({ source, allUsers, onClose }: TransferModalProps) {
  const candidates = allUsers.filter((u) => u.id !== source.id && u.om === source.om && u.ativo)
  const [selectedId, setSelectedId] = useState('')
  const [transferring, setTransferring] = useState(false)

  const handleTransfer = async () => {
    if (!selectedId) { toast.error('Selecione o novo responsável'); return }
    setTransferring(true)
    try {
      const res = await usersApi.transferirPedidos(source.id, parseInt(selectedId))
      toast.success(res.data.transferidos > 0
        ? `${res.data.transferidos} pedido(s) transferidos`
        : 'Nenhum pedido ativo para transferir')
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao transferir pedidos')
    } finally { setTransferring(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Transferir Pedidos</h2>
            <p className="text-xs text-zinc-500 mt-0.5">De: <span className="text-zinc-300">{source.nome}</span> · OM: <span className="text-zinc-300">{source.om}</span></p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <ArrowRightLeft className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-300/80 leading-relaxed">
              Todos os pedidos em <strong>Rascunho</strong> serão reatribuídos ao novo responsável.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Novo responsável <span className="text-red-400">*</span></label>
            {candidates.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">Nenhum outro usuário ativo na mesma OM ({source.om}).</p>
            ) : (
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                <option value="">Selecione um usuário…</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id.toString()}>{u.nome} — {PERFIL_LABELS[u.perfil]}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="flex gap-2 p-6 pt-0">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-colors">Cancelar</button>
          <button onClick={handleTransfer} disabled={transferring || !selectedId || candidates.length === 0}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/80 text-white text-sm font-medium hover:bg-amber-500 disabled:opacity-50 transition-colors">
            <ArrowRightLeft className="h-4 w-4" />
            {transferring ? 'Transferindo…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Painel de detalhes (linha expansível) ────────────────────────────────────
function DetailPanel({ u }: { u: Usuario }) {
  const field = (label: string, value: React.ReactNode, icon?: React.ReactNode) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium flex items-center gap-1">
        {icon}{label}
      </span>
      <span className="text-xs text-zinc-200 break-all">{value ?? '—'}</span>
    </div>
  )

  return (
    <div className="px-4 pb-4 bg-zinc-950/60 border-t border-white/5">
      {/* Fluxo de aprovação */}
      <div className="mt-3 mb-3 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
        <p className="text-[10px] uppercase tracking-wide text-emerald-500/70 font-medium mb-0.5">Fluxo de aprovação</p>
        <p className="text-xs text-emerald-300/90">{fluxoLabel(u)}</p>
      </div>

      {/* Grid de dados */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
        {field('E-mail', u.email, <Mail className="h-3 w-3" />)}
        {field('OM', u.om, <Building2 className="h-3 w-3" />)}
        {field('Seção OM', u.secao_om)}
        {field('Telefone', u.telefone, <Phone className="h-3 w-3" />)}
        {field('Telefone RITEX', u.telefone_ritex)}
        {field('Região Militar', u.regiao_militar, <MapPin className="h-3 w-3" />)}
        {field('Órgão Vinculante', u.orgao_vinculante)}
        {field('Posto/Graduação', u.posto_graduacao)}
        {field('CGEO ID', u.cgeo_id != null ? String(u.cgeo_id) : null)}

        {field('E-mail confirmado',
          u.email_confirmado
            ? <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3 w-3" />Confirmado</span>
            : <span className="inline-flex items-center gap-1 text-amber-400"><AlertTriangle className="h-3 w-3" />Pendente</span>
        )}
        {field('Status da conta',
          u.ativo
            ? <span className="inline-flex items-center gap-1 text-emerald-400"><ShieldCheck className="h-3 w-3" />Ativo</span>
            : <span className="inline-flex items-center gap-1 text-red-400"><ShieldOff className="h-3 w-3" />Inativo</span>
        )}
        {field('Tentativas de login',
          u.tentativas_login > 0
            ? <span className="text-amber-400">{u.tentativas_login} tentativa(s) falha(s)</span>
            : '0'
        )}
        {field('Bloqueado até',
          u.bloqueado_ate
            ? <span className="inline-flex items-center gap-1 text-orange-400"><Clock className="h-3 w-3" />{fmt(u.bloqueado_ate)}</span>
            : <span className="text-zinc-500">Não bloqueado</span>
        )}

        {field('Cadastrado em', fmt(u.criado_em))}
        {field('Atualizado em', fmt(u.atualizado_em))}
        {field('Última troca de senha', fmt(u.ultima_senha_alterada))}
        {field('Confirmação de dados', fmt(u.ultima_confirmacao_dados))}
      </div>
    </div>
  )
}

// ─── Linha de usuário ─────────────────────────────────────────────────────────
interface UserRowProps {
  u: Usuario
  allUsers: Usuario[]
  expanded: boolean
  onToggleExpand: () => void
  onProfileChange: (perfil: Perfil) => void
  onToggleActive: () => void
  onTransfer: () => void
  onHistorico: () => void
}
function UserRow({
  u, allUsers, expanded,
  onToggleExpand, onProfileChange, onToggleActive, onTransfer, onHistorico,
}: UserRowProps) {
  return (
    <>
      <tr
        className={`border-b border-white/5 transition-colors cursor-pointer ${expanded ? 'bg-zinc-800/40' : 'hover:bg-white/[0.03]'}`}
        onClick={onToggleExpand}
      >
        {/* Expansão */}
        <td className="px-3 py-3 w-8">
          {expanded
            ? <ChevronUp className="h-4 w-4 text-zinc-500" />
            : <ChevronDown className="h-4 w-4 text-zinc-500" />
          }
        </td>

        {/* Nome */}
        <td className="px-3 py-3">
          <div>
            <p className="text-sm font-medium text-zinc-200 leading-snug">
              {formatNomeComPosto(u.nome, u.posto_graduacao, u.nome_de_guerra)}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">{u.email}</p>
          </div>
        </td>

        {/* OM */}
        <td className="px-3 py-3 text-xs text-zinc-400 hidden md:table-cell">
          <div>
            <span>{u.om}</span>
            {u.regiao_militar && (
              <span className="ml-1.5 text-zinc-600">· {u.regiao_militar}</span>
            )}
          </div>
        </td>

        {/* Órgão */}
        <td className="px-3 py-3 hidden lg:table-cell">
          {u.orgao_vinculante
            ? <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">{u.orgao_vinculante}</span>
            : <span className="text-xs text-zinc-600">—</span>
          }
        </td>

        {/* Perfil — dropdown (clique não propaga para expand) */}
        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
          <select
            value={u.perfil}
            onChange={(e) => onProfileChange(e.target.value as Perfil)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {PERFIL_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.perfis.map((p) => (
                  <option key={p} value={p} className="bg-zinc-800">{PERFIL_LABELS[p]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </td>

        {/* Status */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-1.5">
            {u.ativo
              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="h-3 w-3" />Ativo</span>
              : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/10 text-red-400 border border-red-500/20"><XCircle className="h-3 w-3" />Inativo</span>
            }
            {!u.email_confirmado && (
              <span title="E-mail não confirmado">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              </span>
            )}
            {u.bloqueado_ate && (
              <span title="Conta bloqueada">
                <Clock className="h-3.5 w-3.5 text-orange-400" />
              </span>
            )}
          </div>
        </td>

        {/* Ações */}
        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={onToggleActive}
              className={`text-xs px-2 py-1 rounded-md font-medium transition-colors border ${
                u.ativo
                  ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20'
              }`}>
              {u.ativo ? 'Desativar' : 'Ativar'}
            </button>
            <button onClick={onTransfer}
              className="text-xs px-2 py-1 rounded-md font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors flex items-center gap-1">
              <ArrowRightLeft className="h-3 w-3" />
              <span className="hidden sm:inline">Transferir</span>
            </button>
            <button onClick={onHistorico}
              className="text-xs px-2 py-1 rounded-md font-medium bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700 border border-zinc-600/50 transition-colors flex items-center gap-1">
              <History className="h-3 w-3" />
              <span className="hidden sm:inline">Histórico</span>
            </button>
          </div>
        </td>
      </tr>

      {/* Painel de detalhes */}
      {expanded && (
        <tr className="border-b border-white/5">
          <td colSpan={7} className="p-0">
            <DetailPanel u={u} />
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function GerenciarUsuarios() {
  const [users, setUsers] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [transferSource, setTransferSource] = useState<Usuario | null>(null)
  const [historicoSource, setHistoricoSource] = useState<Usuario | null>(null)
  const [search, setSearch] = useState('')

  const load = () => {
    usersApi.listUsers()
      .then((r) => setUsers(r.data))
      .catch(() => toast.error('Erro ao carregar usuários'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleProfileChange = async (u: Usuario, perfil: Perfil) => {
    try {
      await usersApi.updateProfile(u.id, perfil)
      toast.success('Perfil atualizado')
      load()
    } catch { toast.error('Erro ao atualizar perfil') }
  }

  const handleToggle = async (u: Usuario) => {
    try {
      await usersApi.toggleActivate(u.id)
      toast.success(u.ativo ? 'Usuário desativado' : 'Usuário ativado')
      load()
    } catch { toast.error('Erro ao alterar status') }
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    return !q || [u.nome, u.email, u.om, u.perfil, u.orgao_vinculante ?? '', u.regiao_militar ?? '']
      .some((v) => v.toLowerCase().includes(q))
  })

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
          <Users className="h-5 w-5 text-zinc-400" />
          Gerenciar Usuários
          <span className="text-sm font-normal text-zinc-500 ml-1">({users.length})</span>
        </h1>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail, OM, perfil…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-72"
          />
        </div>
      </div>

      <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10 bg-zinc-950/40">
            <tr>
              <th className="px-3 py-3 w-8" />
              <th className="px-3 py-3 text-left font-medium text-zinc-400 text-xs uppercase tracking-wide">Usuário</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-400 text-xs uppercase tracking-wide hidden md:table-cell">OM / Região</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-400 text-xs uppercase tracking-wide hidden lg:table-cell">Órgão</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-400 text-xs uppercase tracking-wide">Perfil</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-400 text-xs uppercase tracking-wide">Status</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-400 text-xs uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-zinc-500 text-sm italic">
                  {search ? `Nenhum usuário encontrado para "${search}"` : 'Nenhum usuário cadastrado.'}
                </td>
              </tr>
            ) : filtered.map((u) => (
              <UserRow
                key={u.id}
                u={u}
                allUsers={users}
                expanded={expandedId === u.id}
                onToggleExpand={() => setExpandedId(expandedId === u.id ? null : u.id)}
                onProfileChange={(p) => handleProfileChange(u, p)}
                onToggleActive={() => handleToggle(u)}
                onTransfer={() => setTransferSource(u)}
                onHistorico={() => setHistoricoSource(u)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {transferSource && (
        <TransferModal source={transferSource} allUsers={users} onClose={() => setTransferSource(null)} />
      )}
      {historicoSource && (
        <HistoricoModal user={historicoSource} onClose={() => setHistoricoSource(null)} />
      )}
    </div>
  )
}
