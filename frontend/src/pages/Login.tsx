import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authApi } from '../api/auth'
import { usersApi } from '../api/users'
import { useAuthStore } from '../store/authStore'
import { trackEvent } from '../firebase'

export function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const { setToken, setUser } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authApi.login(email, senha)
      setToken(res.data.access_token)
      const me = await usersApi.getMe()
      setUser(me.data)
      trackEvent('login', { method: 'email', perfil: me.data.perfil })
      toast.success('Login realizado com sucesso!')
      navigate('/')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      const msg = e.response?.data?.detail ?? 'Erro ao realizar login'
      toast.error(msg, { duration: 5000 })
    } finally {
      setLoading(false)
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
            <p className="text-zinc-500 text-sm mt-1">Sistema de Pedidos de Geoinformação — DSG/EB</p>
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
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              />
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
