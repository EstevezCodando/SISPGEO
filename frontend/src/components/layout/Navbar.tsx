import { Link, useNavigate } from 'react-router-dom'
import { LogOut, User } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { NotificationBell } from '../shared/NotificationBell'
import { formatNomeComPosto } from '../../data/postos'

export function Navbar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav className="relative z-50 bg-zinc-900/80 backdrop-blur-md border-b border-white/10 shrink-0">
      <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/dsg.png" alt="DSG" className="h-8 w-auto" />
          <span className="font-semibold text-lg text-zinc-100 tracking-tight">SisPGeo</span>
          <span className="text-zinc-500 font-normal text-sm hidden sm:block">| DSG/EB</span>
        </Link>

        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-end text-xs leading-tight">
              <span className="font-medium text-zinc-200">{formatNomeComPosto(user.nome, user.posto_graduacao, user.nome_de_guerra)}</span>
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <Link
                to="/meus-dados"
                className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-zinc-200 transition-colors"
                title="Meus Dados"
              >
                <User className="h-4 w-4" />
              </Link>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-red-400 transition-colors"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
