import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowRightLeft, X, History } from 'lucide-react'
import { usersApi } from '../../api/users'
import type { Transferencia } from '../../api/users'
import { LoadingSpinner } from '../../components/shared/LoadingSpinner'
import type { Usuario, Perfil } from '../../types/user'

const PERFIS: Perfil[] = [
  'SOLICITANTE', 'SUPERVISOR', 'CONSOLIDADOR', 'GESTOR_CARTOGRAFICO', 'ANALISTA_CGEO',
]

const PERFIL_LABELS: Record<Perfil, string> = {
  SOLICITANTE:         'Solicitante (OMDS)',
  SUPERVISOR:          'Supervisor (C. Mil. A)',
  CONSOLIDADOR:        'Consolidador (COTER/COLOG)',
  GESTOR_CARTOGRAFICO: 'Gestor Cartográfico (DSG)',
  ANALISTA_CGEO:       'Analista CGEO',
}

// ─── Modal de histórico de transferências ─────────────────────────────────────
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
                    <span className="text-zinc-500">
                      {format(new Date(t.transferido_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-400">{t.de_usuario_nome ?? '—'}</span>
                    <ArrowRightLeft className="h-3 w-3 text-amber-400" />
                    <span className="text-emerald-400 font-medium">{t.para_usuario_nome ?? '—'}</span>
                  </div>
                  {t.observacao && (
                    <p className="text-[10px] text-zinc-500 mt-1 italic">{t.observacao}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-6 pt-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de transferência de pedidos ────────────────────────────────────────
interface TransferModalProps {
  source: Usuario
  allUsers: Usuario[]
  onClose: () => void
}
function TransferModal({ source, allUsers, onClose }: TransferModalProps) {
  const candidates = allUsers.filter(
    (u) => u.id !== source.id && u.om === source.om && u.ativo,
  )
  const [selectedId, setSelectedId] = useState<string>('')
  const [transferring, setTransferring] = useState(false)

  const handleTransfer = async () => {
    if (!selectedId) {
      toast.error('Selecione o novo responsável')
      return
    }
    setTransferring(true)
    try {
      const res = await usersApi.transferirPedidos(source.id, parseInt(selectedId))
      toast.success(
        res.data.transferidos > 0
          ? `${res.data.transferidos} pedido(s) transferidos para ${res.data.novo_responsavel}`
          : 'Nenhum pedido ativo para transferir'
      )
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao transferir pedidos')
    } finally {
      setTransferring(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Transferir Pedidos</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              De: <span className="text-zinc-300">{source.nome}</span> · OM: <span className="text-zinc-300">{source.om}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <ArrowRightLeft className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-300/80 leading-relaxed">
              Todos os pedidos em <strong>Rascunho</strong>, <strong>Em revisão</strong> e
              <strong> Devolvido</strong> serão reatribuídos ao novo responsável. Ele
              receberá uma notificação in-app e um e-mail.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Novo responsável <span className="text-red-400">*</span>
            </label>
            {candidates.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">
                Nenhum outro usuário ativo encontrado na mesma OM ({source.om}).
              </p>
            ) : (
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">Selecione um usuário…</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id.toString()}>
                    {u.nome} — {PERFIL_LABELS[u.perfil]}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex gap-2 p-6 pt-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleTransfer}
            disabled={transferring || !selectedId || candidates.length === 0}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/80 text-white text-sm font-medium hover:bg-amber-500 disabled:opacity-50 transition-colors"
          >
            <ArrowRightLeft className="h-4 w-4" />
            {transferring ? 'Transferindo…' : 'Confirmar transferência'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function GerenciarUsuarios() {
  const [users, setUsers] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [transferSource, setTransferSource] = useState<Usuario | null>(null)
  const [historicoSource, setHistoricoSource] = useState<Usuario | null>(null)

  const load = () => {
    usersApi.listUsers()
      .then((r) => setUsers(r.data))
      .catch(() => toast.error('Erro ao carregar usuários'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleProfileChange = async (user: Usuario, perfil: Perfil) => {
    try {
      await usersApi.updateProfile(user.id, perfil)
      toast.success('Perfil atualizado')
      load()
    } catch {
      toast.error('Erro ao atualizar perfil')
    }
  }

  const handleToggle = async (user: Usuario) => {
    try {
      await usersApi.toggleActivate(user.id)
      toast.success(user.ativo ? 'Usuário desativado' : 'Usuário ativado')
      load()
    } catch {
      toast.error('Erro ao alterar status')
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <h1 className="text-xl font-semibold text-zinc-100 tracking-tight mb-6">Gerenciar Usuários</h1>

      <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-zinc-400">Nome</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-400">Email</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-400">OM</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-400">Perfil</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-400">Status</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-400">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 font-medium text-zinc-200">{u.nome}</td>
                <td className="px-4 py-3 text-zinc-400">{u.email}</td>
                <td className="px-4 py-3 text-zinc-400">{u.om}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.perfil}
                    onChange={(e) => handleProfileChange(u, e.target.value as Perfil)}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {PERFIS.map((p) => (
                      <option key={p} value={p} className="bg-zinc-800">
                        {PERFIL_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.ativo
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {u.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(u)}
                      className={`text-xs px-2 py-1 rounded-md font-medium transition-colors ${
                        u.ativo
                          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                      }`}
                    >
                      {u.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() => setTransferSource(u)}
                      title="Transferir pedidos ativos para outro usuário da mesma OM"
                      className="text-xs px-2 py-1 rounded-md font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors flex items-center gap-1"
                    >
                      <ArrowRightLeft className="h-3 w-3" />
                      Transferir pedidos
                    </button>
                    <button
                      onClick={() => setHistoricoSource(u)}
                      title="Ver histórico de transferências"
                      className="text-xs px-2 py-1 rounded-md font-medium bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700 border border-zinc-600/50 transition-colors flex items-center gap-1"
                    >
                      <History className="h-3 w-3" />
                      Histórico
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {transferSource && (
        <TransferModal
          source={transferSource}
          allUsers={users}
          onClose={() => setTransferSource(null)}
        />
      )}
      {historicoSource && (
        <HistoricoModal
          user={historicoSource}
          onClose={() => setHistoricoSource(null)}
        />
      )}
    </div>
  )
}
