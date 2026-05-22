import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Eye, EyeOff, KeyRound, CheckCircle2, XCircle } from 'lucide-react'
import { authApi } from '../api/auth'

/** Valida a senha com as mesmas regras do backend */
function validarSenha(senha: string): string | null {
  if (senha.length < 8)        return 'Mínimo 8 caracteres'
  if (!/[A-Z]/.test(senha))    return 'Pelo menos uma letra maiúscula'
  if (!/[a-z]/.test(senha))    return 'Pelo menos uma letra minúscula'
  if (!/[0-9]/.test(senha))    return 'Pelo menos um número'
  if (!/[^A-Za-z0-9]/.test(senha)) return 'Pelo menos um caractere especial'
  return null
}

function RequisitosItem({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li className={`flex items-center gap-1.5 text-xs transition-colors ${ok ? 'text-emerald-400' : 'text-zinc-500'}`}>
      {ok
        ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
        : <XCircle className="h-3.5 w-3.5 flex-shrink-0" />}
      {texto}
    </li>
  )
}

export function RedefinirSenha() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [showNova, setShowNova] = useState(false)
  const [showConfirmar, setShowConfirmar] = useState(false)
  const [loading, setLoading] = useState(false)
  const [concluido, setConcluido] = useState(false)

  const erroSenha = novaSenha ? validarSenha(novaSenha) : null
  const senhaOk = novaSenha.length > 0 && erroSenha === null
  const confirmacaoOk = novaSenha === confirmar && confirmar.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!token) {
      toast.error('Token de recuperação inválido')
      return
    }
    const erro = validarSenha(novaSenha)
    if (erro) { toast.error(erro); return }
    if (!confirmacaoOk) { toast.error('As senhas não coincidem'); return }

    setLoading(true)
    try {
      await authApi.resetPassword(token, novaSenha)
      setConcluido(true)
      toast.success('Senha redefinida com sucesso!')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      const msg = e.response?.data?.detail ?? 'Erro ao redefinir senha'
      toast.error(msg, { duration: 6000 })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/15 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-8">

          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img src="/dsg.png" alt="DSG" className="h-14 w-auto" />
            </div>
            <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
              Nova senha
            </h1>
            <p className="text-zinc-500 text-sm mt-1">SisPGeo — DSG/EB</p>
          </div>

          {/* Token ausente */}
          {!token ? (
            <div className="text-center space-y-4">
              <XCircle className="h-12 w-12 text-red-400 mx-auto" />
              <p className="text-zinc-300">Link de recuperação inválido ou expirado.</p>
              <Link to="/esqueci-senha" className="text-emerald-400 hover:text-emerald-300 text-sm">
                Solicitar novo link
              </Link>
            </div>
          ) : concluido ? (
            /* ── Senha redefinida com sucesso ── */
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-emerald-500/10 border border-emerald-500/20 p-4">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                </div>
              </div>
              <div>
                <p className="text-zinc-100 font-medium">Senha redefinida!</p>
                <p className="text-zinc-400 text-sm mt-2">
                  Sua senha foi atualizada com sucesso. Você já pode fazer login.
                </p>
              </div>
              <button
                onClick={() => navigate('/login')}
                className="mt-2 bg-emerald-500 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-emerald-400 transition-colors shadow-[0_4px_20px_-4px_rgba(16,185,129,0.5)]"
              >
                Ir para o login
              </button>
            </div>
          ) : (
            /* ── Formulário ── */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nova senha */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Nova senha
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    type={showNova ? 'text' : 'password'}
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    required
                    placeholder="Nova senha"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-10 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNova(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showNova ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Requisitos em tempo real */}
                {novaSenha.length > 0 && (
                  <ul className="mt-2 space-y-1 pl-1">
                    <RequisitosItem ok={novaSenha.length >= 8}            texto="Mínimo 8 caracteres" />
                    <RequisitosItem ok={/[A-Z]/.test(novaSenha)}          texto="Uma letra maiúscula" />
                    <RequisitosItem ok={/[a-z]/.test(novaSenha)}          texto="Uma letra minúscula" />
                    <RequisitosItem ok={/[0-9]/.test(novaSenha)}          texto="Um número" />
                    <RequisitosItem ok={/[^A-Za-z0-9]/.test(novaSenha)}   texto="Um caractere especial" />
                  </ul>
                )}
              </div>

              {/* Confirmar senha */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Confirmar nova senha
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    type={showConfirmar ? 'text' : 'password'}
                    value={confirmar}
                    onChange={(e) => setConfirmar(e.target.value)}
                    required
                    placeholder="Repita a nova senha"
                    className={`w-full bg-zinc-800 border rounded-lg pl-9 pr-10 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 transition-colors ${
                      confirmar.length > 0
                        ? confirmacaoOk
                          ? 'border-emerald-500/60 focus:ring-emerald-500 focus:border-emerald-500'
                          : 'border-red-500/60 focus:ring-red-500/50 focus:border-red-500/50'
                        : 'border-zinc-700 focus:ring-emerald-500 focus:border-emerald-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmar(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showConfirmar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmar.length > 0 && !confirmacaoOk && (
                  <p className="text-xs text-red-400 mt-1">As senhas não coincidem</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || !senhaOk || !confirmacaoOk}
                className="w-full bg-emerald-500 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_-4px_rgba(16,185,129,0.5)] mt-2"
              >
                {loading ? 'Salvando...' : 'Redefinir senha'}
              </button>

              <p className="text-center">
                <Link to="/login" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  Voltar para o login
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
