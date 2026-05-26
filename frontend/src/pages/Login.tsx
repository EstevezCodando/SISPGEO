import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '../api/auth'
import { usersApi } from '../api/users'
import { useAuthStore } from '../store/authStore'

export function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [loading, setLoading] = useState(false)
  const [emailNaoConfirmado, setEmailNaoConfirmado] = useState(false)
  const [reenvioLoading, setReenvioLoading] = useState(false)
  const { setToken, setUser } = useAuthStore()
  const navigate = useNavigate()

  const EMAIL_NAO_CONFIRMADO_MSG = 'E-mail não confirmado'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setEmailNaoConfirmado(false)
    try {
      const res = await authApi.login(email, senha)
      setToken(res.data.access_token)
      const me = await usersApi.getMe()
      setUser(me.data)
      toast.success('Login realizado com sucesso!')
      navigate('/')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      const msg = e.response?.data?.detail ?? 'Erro ao realizar login'

      // Detectar erro de e-mail não confirmado para exibir opção de reenvio
      if (msg.toLowerCase().includes('não confirmado') || msg.toLowerCase().includes('nao confirmado')) {
        setEmailNaoConfirmado(true)
        toast.error(msg, { duration: 9000 })
      } else {
        toast.error(msg, { duration: 8000 })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResendActivation = async () => {
    if (!email) {
      toast.error('Preencha o e-mail acima antes de reenviar.')
      return
    }
    setReenvioLoading(true)
    try {
      await authApi.resendActivation(email)
      toast.success('Link de ativação reenviado! Verifique sua caixa de entrada.', { duration: 7000 })
      setEmailNaoConfirmado(false)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      const msg = e.response?.data?.detail ?? 'Erro ao reenviar link de ativação'
      toast.error(msg, { duration: 7000 })
    } finally {
      setReenvioLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Glow de fundo */}
      <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/15 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img src="/dsg.png" alt="DSG" className="h-14 w-auto" />
            </div>
            <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">SisPGeo</h1>
            <p className="text-zinc-500 text-sm mt-1">Sistema de Pedidos de Geoinformação – DSG/EB</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Email Institucional
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@eb.mil.br"
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 pr-10 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  tabIndex={-1}
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Link to="/esqueci-senha" className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                Esqueci minha senha
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_20px_-4px_rgba(16,185,129,0.5)]"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          {/* Reenvio de link de ativação — aparece apenas quando o erro for e-mail não confirmado */}
          {emailNaoConfirmado && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-center">
              <p className="text-xs text-amber-400 mb-2">
                Não recebeu o e-mail de ativação?
              </p>
              <button
                type="button"
                onClick={handleResendActivation}
                disabled={reenvioLoading}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${reenvioLoading ? 'animate-spin' : ''}`} />
                {reenvioLoading ? 'Reenviando...' : 'Reenviar link de ativação'}
              </button>
            </div>
          )}

          <p className="text-center text-sm text-zinc-500 mt-6">
            Não tem conta?{' '}
            <Link to="/cadastro" className="text-emerald-400 font-medium hover:text-emerald-300 transition-colors">
              Cadastre-se
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
