import { useState } from 'react'
import toast from 'react-hot-toast'
import { usersApi } from '../api/users'
import { useAuthStore } from '../store/authStore'
import { POSTOS, formatNomeComPosto } from '../data/postos'

const CMILA_LABELS: Record<string, string> = {
  CMP:  'C Mil Planalto (Brasília)',
  CML:  'C Mil Leste (Rio de Janeiro)',
  CMS:  'C Mil Sul (Porto Alegre)',
  CMO:  'C Mil Oeste (Campo Grande)',
  CMAO: 'C Mil Amazônia Ocidental (Boa Vista)',
  CMA:  'C Mil Amazônia (Manaus)',
  CMNE: 'C Mil Nordeste (Recife)',
  CMSE: 'C Mil Sudeste (São Paulo)',
}

const ORGAO_LABELS: Record<string, string> = {
  COTER: 'COTER — Comando de Operações Terrestres',
  DEC:   'DEC — Departamento de Educação e Cultura',
  COLOG: 'COLOG — Comando Logístico',
  DECEx: 'DECEx — Dep. de Educação e Cultura do Exército',
  DSG:   'DSG — Diretoria do Serviço Geográfico',
}

/** Retorna o rótulo de subordinação e o detalhe do fluxo para exibição. */
function getSubordinacao(
  orgao: string | null,
  regiao: string | null,
): { label: string; fluxo: string } {
  if (!orgao) return { label: '—', fluxo: '' }

  // Usuário vinculado ao COTER com região militar definida (passa pelo C Mil A)
  if (orgao === 'COTER' && regiao) {
    const cmila = CMILA_LABELS[regiao] ?? regiao
    return {
      label: cmila,
      fluxo: 'Pedidos: OM → Supervisor C Mil A → Consolidador COTER → DSG',
    }
  }

  // Vinculado a outro órgão (sem supervisor C Mil A intermediário)
  return {
    label: ORGAO_LABELS[orgao] ?? orgao,
    fluxo: `Pedidos: OM → Consolidador ${orgao} → DSG`,
  }
}

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors'
const labelCls = 'block text-sm font-medium text-zinc-300 mb-1.5'

export function MeusDados() {
  const { user, setUser } = useAuthStore()
  const [nomeDeGuerra, setNomeDeGuerra] = useState(user?.nome_de_guerra ?? '')
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
      const res = await usersApi.updateMe({
        nome_de_guerra: nomeDeGuerra || undefined,
        telefone,
        secao_om: secao,
        posto_graduacao: posto || undefined,
      })
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

  const subordinacao = getSubordinacao(user.orgao_vinculante, user.regiao_militar)

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Meus Dados</h1>

      {/* Informações gerais (somente leitura) */}
      <div className="bg-zinc-900 border border-white/10 rounded-xl p-6">
        <h2 className="font-medium text-zinc-200 mb-4">Informações da Conta</h2>
        <div className="grid grid-cols-2 gap-4 mb-5 text-sm">
          <div className="col-span-2">
            <span className="text-zinc-500 text-xs">Nome</span>
            <p className="font-semibold text-zinc-100 mt-0.5 text-base">
              {formatNomeComPosto(user.nome, user.posto_graduacao, user.nome_de_guerra)}
            </p>
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
            <p className="font-medium text-zinc-200 mt-0.5">
              {user.regiao_militar
                ? (CMILA_LABELS[user.regiao_militar] ?? user.regiao_militar)
                : <span className="text-zinc-500 italic">Não informada</span>}
            </p>
          </div>
          <div className="col-span-2">
            <span className="text-zinc-500 text-xs">Órgão Consolidador</span>
            <p className="font-medium text-zinc-200 mt-0.5">{subordinacao.label}</p>
            {subordinacao.fluxo && (
              <p className="text-[11px] text-zinc-500 mt-0.5">{subordinacao.fluxo}</p>
            )}
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
                  {p.abrev} - {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Nome de Guerra</label>
            <input
              type="text"
              value={nomeDeGuerra}
              onChange={(e) => setNomeDeGuerra(e.target.value)}
              placeholder="Como é chamado(a) militarmente"
              className={inputCls}
            />
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
            <label className={labelCls}>Função / Seção</label>
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
