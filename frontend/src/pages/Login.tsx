import { useState, useRef, type ElementType, type ReactNode, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Eye, EyeOff, RefreshCw,
  AlertCircle, ShieldAlert, MailWarning, Clock, KeyRound, XCircle,
} from 'lucide-react'
import { authApi } from '../api/auth'
import { usersApi } from '../api/users'
import { useAuthStore } from '../store/authStore'

// ─── Tipos de erro de login ───────────────────────────────────────────────────
type ErrorKind =
  | 'credentials'   // e-mail ou senha errados
  | 'unconfirmed'   // e-mail não confirmado
  | 'inactive'      // conta pendente de ativação pelo admin
  | 'locked'        // conta bloqueada por excesso de tentativas
  | 'expired'       // senha expirada
  | 'generic'       // outro erro inesperado

interface LoginError {
  kind: ErrorKind
  msg: string
}

function classifyError(detail: string, status?: number): LoginError {
  const d = detail.toLowerCase()

  if (d.includes('bloqueada') || d.includes('bloqueado'))
    return { kind: 'locked', msg: detail }

  if (d.includes('não confirmado') || d.includes('nao confirmado') || d.includes('ativação'))
    return { kind: 'unconfirmed', msg: detail }

  if (d.includes('pendente de ativação') || d.includes('pendente de ativacao'))
    return { kind: 'inactive', msg: detail }

  if (d.includes('senha expirada') || d.includes('expirada'))
    return { kind: 'expired', msg: detail }

  if (status === 401 || d.includes('credenciais inválidas') || d.includes('credenciais invalidas'))
    return { kind: 'credentials', msg: 'E-mail ou senha incorretos. Verifique os dados e tente novamente.' }

  return { kind: 'generic', msg: detail }
}

// Tempo mínimo (ms) que o bloco de erro fica visível antes de poder ser limpo
const MIN_ERROR_MS = 5_000

// ─── Bloco de erro inline ─────────────────────────────────────────────────────
interface ErrorBlockProps {
  error: LoginError
  email: string
  onResend: () => void
  reenvioLoading: boolean
}

function ErrorBlock({ error, email, onResend, reenvioLoading }: ErrorBlockProps) {
  const base = 'mt-4 flex gap-3 rounded-lg border p-3.5 text-sm'

  const configs: Record<ErrorKind, { cls: string; Icon: ElementType; title: string; body?: ReactNode }> = {
    credentials: {
      cls: `${base} bg-red-500/10 border-red-500/30`,
      Icon: XCircle,
      title: 'E-mail ou senha incorretos',
      body: <span className="text-red-300/80">Verifique os dados inseridos e tente novamente.</span>,
    },
    unconfirmed: {
      cls: `${base} bg-amber-500/10 border-amber-500/30`,
      Icon: MailWarning,
      title: 'E-mail ainda não confirmado',
      body: (
        <span className="text-amber-300/80">
          Verifique sua caixa de entrada (e a pasta de spam) e clique no link de ativação enviado ao cadastrar.
          <br />
          <button
            type="button"
            onClick={onResend}
            disabled={!email || reenvioLoading}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${reenvioLoading ? 'animate-spin' : ''}`} />
            {reenvioLoading ? 'Reenviando…' : 'Reenviar link de ativação'}
          </button>
        </span>
      ),
    },
    inactive: {
      cls: `${base} bg-zinc-800/60 border-zinc-600/40`,
      Icon: ShieldAlert,
      title: 'Conta pendente de ativação',
      body: (
        <span className="text-zinc-400">
          Sua conta foi cadastrada mas ainda não foi ativada pelo administrador do sistema.
          Entre em contato com a DSG no telefone (61) 3415-5237 ou 860-5237 (RITEx).
        </span>
      ),
    },
    locked: {
      cls: `${base} bg-orange-500/10 border-orange-500/30`,
      Icon: Clock,
      title: 'Conta temporariamente bloqueada',
      body: <span className="text-orange-300/80">{error.msg}</span>,
    },
    expired: {
      cls: `${base} bg-yellow-500/10 border-yellow-500/30`,
      Icon: KeyRound,
      title: 'Senha expirada',
      body: (
        <span className="text-yellow-300/80">
          Sua senha precisa ser renovada.{' '}
          <Link to="/esqueci-senha" className="underline hover:text-yellow-200 transition-colors">
            Redefinir senha
          </Link>
        </span>
      ),
    },
    generic: {
      cls: `${base} bg-red-500/10 border-red-500/30`,
      Icon: AlertCircle,
      title: 'Erro ao entrar',
      body: <span className="text-red-300/80">{error.msg}</span>,
    },
  }

  const { cls, Icon, title, body } = configs[error.kind]

  return (
    <div className={cls} role="alert">
      <Icon className="h-4 w-4 shrink-0 mt-0.5 text-current opacity-80" />
      <div className="min-w-0">
        <p className="font-medium leading-snug">{title}</p>
        {body && <div className="mt-0.5 text-xs leading-relaxed">{body}</div>}
      </div>
    </div>
  )
}

// ─── Página de Login ──────────────────────────────────────────────────────────
export function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reenvioLoading, setReenvioLoading] = useState(false)
  const [error, setError] = useState<LoginError | null>(null)
  const errorSetAt  = useRef<number>(0)
  const clearTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { setToken, setUser } = useAuthStore()

  /** Exibe um erro e registra o instante para controle do temporizador. */
  const showError = (err: LoginError) => {
    if (clearTimer.current) { clearTimeout(clearTimer.current); clearTimer.current = null }
    errorSetAt.current = Date.now()
    setError(err)
  }

  /** Limpa o erro somente após MIN_ERROR_MS desde que foi exibido.
   *  Se ainda não passou o tempo, agenda a limpeza para o momento certo. */
  const dismissError = () => {
    const elapsed   = Date.now() - errorSetAt.current
    const remaining = MIN_ERROR_MS - elapsed
    if (remaining <= 0) {
      setError(null)
    } else if (!clearTimer.current) {
      clearTimer.current = setTimeout(() => {
        setError(null)
        clearTimer.current = null
      }, remaining)
    }
  }
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authApi.login(email, senha)
      setToken(res.data.access_token)
      const me = await usersApi.getMe()
      setUser(me.data)
      navigate('/')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { detail?: string } } }
      const status = axiosErr.response?.status
      const detail = axiosErr.response?.data?.detail ?? 'Erro inesperado. Tente novamente.'
      showError(classifyError(detail, status))
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!email) return
    setReenvioLoading(true)
    try {
      await authApi.resendActivation(email)
      showError({
        kind: 'unconfirmed',
        msg: 'Link reenviado! Verifique sua caixa de entrada.',
      })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      const detail = axiosErr.response?.data?.detail ?? 'Erro ao reenviar.'
      showError({ kind: 'generic', msg: detail })
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

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Email Institucional
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); dismissError() }}
                placeholder="nome@eb.mil.br"
                required
                autoComplete="username"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={(e) => { setSenha(e.target.value); dismissError() }}
                  required
                  autoComplete="current-password"
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
              <Link
                to="/esqueci-senha"
                className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Esqueci minha senha
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_20px_-4px_rgba(16,185,129,0.5)]"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          {/* Bloco de erro — visível por no mínimo MIN_ERROR_MS; desaparece ao digitar após esse prazo */}
          {error && (
            <ErrorBlock
              error={error}
              email={email}
              onResend={handleResend}
              reenvioLoading={reenvioLoading}
            />
          )}

          <p className="text-center text-sm mt-6">
            <Link to="/cadastro" className="text-emerald-400 font-medium hover:text-emerald-300 transition-colors">
              Novo Cadastro de Usuário
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
