/**
 * MeusDados — perfil do usuário com suporte a herança de pedidos.
 *
 * Fluxo de herança:
 *   1. Usuário SOLICITANTE seleciona um herdeiro da mesma OM.
 *   2. Após confirmar, todos os pedidos ativos são transferidos.
 *   3. Os campos "OM" e "Região Militar" ficam desbloqueados para edição.
 */
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowRightLeft, CheckCircle2, Lock, Unlock, AlertTriangle } from 'lucide-react'
import { usersApi } from '../api/users'
import { omsApi } from '../api/oms'
import { OMS_DATA } from '../data/omsData'
import { useAuthStore } from '../store/authStore'
import type { Usuario } from '../types/user'
import { POSTOS, formatNomeComPosto } from '../data/postos'

// Códigos dos Comandos Militares de Área (CMilA)
const CMILA_CODES = [
  { code: 'CMP',  label: 'CMP — Comando Militar do Planalto' },
  { code: 'CML',  label: 'CML — Comando Militar do Leste' },
  { code: 'CMS',  label: 'CMS — Comando Militar do Sul' },
  { code: 'CMO',  label: 'CMO — Comando Militar do Oeste' },
  { code: 'CMAO', label: 'CMAO — Comando Militar da Amazônia Ocidental' },
  { code: 'CMA',  label: 'CMA — Comando Militar da Amazônia' },
  { code: 'CMNOR', label: 'CMNOR — Comando Militar do Nordeste' },
  { code: 'CMSE', label: 'CMSE — Comando Militar do Sudeste' },
]

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors'
const inputDisabledCls = 'w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2.5 text-sm text-zinc-500 cursor-not-allowed'
const labelCls = 'block text-sm font-medium text-zinc-300 mb-1.5'

// ─── Seção de herança de pedidos ──────────────────────────────────────────────
function SecaoHeranca({
  user,
  onTransferComplete,
}: {
  user: Usuario
  onTransferComplete: (updated: Usuario) => void
}) {
  const [candidates, setCandidates] = useState<Usuario[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [loadingCandidates, setLoadingCandidates] = useState(true)

  const jaTransferiu = !!user.pedidos_transferidos_em

  useEffect(() => {
    // /users/mesma-om retorna apenas usuários ativos da mesma OM, excluindo o próprio usuário
    // Acessível a qualquer perfil autenticado (ao contrário de /users/ que exige GESTOR_CARTOGRAFICO)
    usersApi.listMesmaOM()
      .then((r) => setCandidates(r.data))
      .catch(() => toast.error('Erro ao carregar usuários da OM'))
      .finally(() => setLoadingCandidates(false))
  }, [])

  const handleTransfer = async () => {
    if (!selectedId) {
      toast.error('Selecione o herdeiro')
      return
    }
    setTransferring(true)
    try {
      const res = await usersApi.transferirPedidos(user.id, parseInt(selectedId))
      const count = res.data.transferidos
      toast.success(
        count > 0
          ? `${count} pedido(s) herdado(s) por ${res.data.novo_responsavel}`
          : `Herança registrada — nenhum pedido ativo para transferir`,
      )
      // Reload own profile to get updated pedidos_transferidos_em
      const meRes = await usersApi.getMe()
      onTransferComplete(meRes.data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao executar herança')
    } finally {
      setTransferring(false)
    }
  }

  if (jaTransferiu) {
    return (
      <div className="bg-zinc-900 border border-white/10 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <h2 className="font-medium text-zinc-200">Herança de Pedidos — Concluída</h2>
        </div>
        <p className="text-sm text-zinc-400">
          Herança executada em{' '}
          <span className="text-zinc-200 font-medium">
            {format(new Date(user.pedidos_transferidos_em!), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </span>
          . Você pode agora atualizar sua OM e Região Militar na seção abaixo.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-amber-500/20 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <ArrowRightLeft className="h-4 w-4 text-amber-400" />
        <h2 className="font-medium text-zinc-200">Herança de Pedidos</h2>
      </div>
      <p className="text-xs text-zinc-500 mb-4">
        Ao mudar de OM ou encerrar suas funções, transfira seus pedidos ativos para um colega da
        mesma unidade. Somente após esta etapa você poderá atualizar sua OM e Região Militar.
      </p>

      <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-4">
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-300/80 leading-relaxed">
          Pedidos nos estados <strong>Rascunho</strong> e{' '}
          <strong>Devolvido</strong> serão reatribuídos ao herdeiro. O herdeiro receberá
          e-mail e notificação in-app.
        </p>
      </div>

      {loadingCandidates ? (
        <p className="text-xs text-zinc-500">Carregando usuários da OM…</p>
      ) : candidates.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">
          Nenhum outro usuário ativo encontrado na OM "{user.om}".
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>
              Herdeiro <span className="text-red-400">*</span>
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className={inputCls}
            >
              <option value="">Selecione um colega da OM…</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id.toString()}>
                  {u.nome} — {u.perfil.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleTransfer}
            disabled={transferring || !selectedId}
            className="flex items-center gap-2 bg-amber-500/80 hover:bg-amber-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <ArrowRightLeft className="h-4 w-4" />
            {transferring ? 'Transferindo pedidos…' : 'Executar herança de pedidos'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Seção de OM e Região Militar ─────────────────────────────────────────────
function SecaoOM({
  user,
  onSaved,
}: {
  user: Usuario
  onSaved: (updated: Usuario) => void
}) {
  const [om, setOm] = useState(user.om)
  const [regiao, setRegiao] = useState(user.regiao_militar ?? '')
  const [saving, setSaving] = useState(false)
  const [customOMs, setCustomOMs] = useState<string[]>([])

  const desbloqueado = !!user.pedidos_transferidos_em

  // Busca OMs customizadas ao mudar o C Mil. A
  useEffect(() => {
    if (!regiao) { setCustomOMs([]); return }
    omsApi.listar(regiao).then(r => setCustomOMs(r.data)).catch(() => setCustomOMs([]))
  }, [regiao])

  const staticOMs = regiao ? (OMS_DATA[regiao]?.oms ?? []) : []
  const allOMs = [...new Set([...staticOMs, ...customOMs])].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
  )
  const omIsCustom = om.trim() !== '' && !allOMs.includes(om.trim())

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      // Persiste OM customizada se não estiver na lista
      if (omIsCustom && regiao) {
        await omsApi.criar(regiao, om.trim()).catch(() => {/* silent */})
      }
      const res = await usersApi.updateMe({ om, regiao_militar: regiao || undefined })
      onSaved(res.data)
      toast.success('OM e Região Militar atualizadas')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-zinc-900 border border-white/10 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        {desbloqueado ? (
          <Unlock className="h-4 w-4 text-emerald-400" />
        ) : (
          <Lock className="h-4 w-4 text-zinc-500" />
        )}
        <h2 className="font-medium text-zinc-200">OM e Região Militar</h2>
        {!desbloqueado && (
          <span className="ml-auto text-xs text-zinc-500 italic">
            Execute a herança de pedidos para desbloquear
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className={labelCls}>Organização Militar (OM)</label>
          {desbloqueado ? (
            <>
              <input
                list="meusdados-om-options"
                value={om}
                onChange={(e) => setOm(e.target.value)}
                placeholder="Escolha ou digite a OM"
                className={inputCls}
              />
              <datalist id="meusdados-om-options">
                {allOMs.map((o) => <option key={o} value={o} />)}
              </datalist>
              {omIsCustom && (
                <p className="text-[11px] text-emerald-500 mt-1">
                  OM não listada — será salva para futuros cadastros ao confirmar
                </p>
              )}
            </>
          ) : (
            <div className={inputDisabledCls}>{user.om}</div>
          )}
        </div>
        <div>
          <label className={labelCls}>Região Militar</label>
          {desbloqueado ? (
            <select
              value={regiao}
              onChange={(e) => setRegiao(e.target.value)}
              className={inputCls}
            >
              <option value="">Selecione…</option>
              {CMILA_CODES.map(({ code, label }) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          ) : (
            <div className={inputDisabledCls}>{user.regiao_militar || '—'}</div>
          )}
        </div>
        {desbloqueado && (
          <button
            type="submit"
            disabled={saving}
            className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-400 transition-colors disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Salvar OM e Região'}
          </button>
        )}
      </form>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function MeusDados() {
  const { user, setUser } = useAuthStore()
  const [telefone, setTelefone] = useState(user?.telefone ?? '')
  const [secao, setSecao] = useState(user?.secao_om ?? '')
  const [posto, setPosto] = useState(user?.posto_graduacao ?? '')
  const [saving, setSaving] = useState(false)
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)

  const handleSaveData = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await usersApi.updateMe({ telefone, secao_om: secao, posto_graduacao: posto || undefined })
      setUser(res.data)
      toast.success('Dados atualizados com sucesso')
    } catch {
      toast.error('Erro ao salvar dados')
    } finally {
      setSaving(false)
    }
  }

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingPwd(true)
    try {
      await usersApi.changePassword(senhaAtual, novaSenha)
      toast.success('Senha alterada com sucesso')
      setSenhaAtual('')
      setNovaSenha('')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao alterar senha')
    } finally {
      setSavingPwd(false)
    }
  }

  if (!user) return null

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Meus Dados</h1>

      {/* Informações gerais (somente leitura) */}
      <div className="bg-zinc-900 border border-white/10 rounded-xl p-6">
        <h2 className="font-medium text-zinc-200 mb-4">Informações da Conta</h2>
        <div className="grid grid-cols-2 gap-4 mb-5 text-sm">
          <div className="col-span-2">
            <span className="text-zinc-500 text-xs">Nome completo</span>
            <p className="font-semibold text-zinc-100 mt-0.5 text-base">
              {formatNomeComPosto(user.nome, user.posto_graduacao)}
            </p>
            {user.posto_graduacao && (
              <p className="text-xs text-zinc-500 mt-0.5">{user.posto_graduacao}</p>
            )}
          </div>
          <div>
            <span className="text-zinc-500 text-xs">Email</span>
            <p className="font-medium text-zinc-200 mt-0.5">{user.email}</p>
          </div>
          <div>
            <span className="text-zinc-500 text-xs">Perfil</span>
            <p className="font-medium text-zinc-200 mt-0.5">{user.perfil.replace(/_/g, ' ')}</p>
          </div>
          <div>
            <span className="text-zinc-500 text-xs">OM atual</span>
            <p className="font-medium text-zinc-200 mt-0.5">{user.om}</p>
          </div>
          <div>
            <span className="text-zinc-500 text-xs">Região Militar</span>
            <p className="font-medium text-zinc-200 mt-0.5">{user.regiao_militar || '—'}</p>
          </div>
        </div>

        <form onSubmit={handleSaveData} className="space-y-3">
          <div>
            <label className={labelCls}>Posto / Graduação</label>
            <select
              value={posto}
              onChange={(e) => setPosto(e.target.value)}
              className={inputCls}
            >
              <option value="">Não informado</option>
              {POSTOS.map((p) => (
                <option key={p.id} value={p.nome}>
                  {p.abrev} — {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Telefone</label>
            <input
              type="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Seção / Função</label>
            <input
              type="text"
              value={secao}
              onChange={(e) => setSecao(e.target.value)}
              className={inputCls}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-400 transition-colors disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Salvar Dados'}
          </button>
        </form>
      </div>

      {/* Herança de pedidos — visível para todos os perfis */}
      <SecaoHeranca
        user={user}
        onTransferComplete={(updated) => setUser(updated)}
      />

      {/* OM e Região Militar — desbloqueado após herança */}
      <SecaoOM
        user={user}
        onSaved={(updated) => setUser(updated)}
      />

      {/* Alterar senha */}
      <div className="bg-zinc-900 border border-white/10 rounded-xl p-6">
        <h2 className="font-medium text-zinc-200 mb-4">Alterar Senha</h2>
        <form onSubmit={handleSavePassword} className="space-y-3">
          <div>
            <label className={labelCls}>Senha Atual</label>
            <input
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Nova Senha</label>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              required
              className={inputCls}
            />
          </div>
          <button
            type="submit"
            disabled={savingPwd}
            className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-400 transition-colors disabled:opacity-60"
          >
            {savingPwd ? 'Salvando…' : 'Alterar Senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
