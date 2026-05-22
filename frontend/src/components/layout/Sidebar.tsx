import { NavLink } from 'react-router-dom'
import {
  FileText, PlusSquare, Users, Settings, MapPin,
  BarChart2, ClipboardCheck, HelpCircle, ShieldAlert,
  Activity, UserCircle,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { SUPERVISOR_PROFILES, CONSOLIDADOR_PROFILES } from '../../types/user'

const SOLICITANTE = ['SOLICITANTE']
const GESTORES = [...Array.from(SUPERVISOR_PROFILES), ...Array.from(CONSOLIDADOR_PROFILES)]
const DSG = ['GESTOR_CARTOGRAFICO']
const CGEO = ['ANALISTA_CGEO']
const NAO_SOLICITANTE = [...GESTORES, ...DSG, ...CGEO]

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  /** Perfis que enxergam este item. Omitir = todos. */
  profiles?: string[]
}

const navItems: NavItem[] = [
  // ── SOLICITANTE (OMDS) ────────────────────────────────────────
  { to: '/solicitar-produtos', label: 'Solicitar Produtos', icon: <PlusSquare className="h-4 w-4" />, profiles: SOLICITANTE },
  { to: '/meus-pedidos',       label: 'Meus Pedidos',       icon: <FileText    className="h-4 w-4" />, profiles: SOLICITANTE },
  { to: '/ajuda',              label: 'Ajuda',              icon: <HelpCircle  className="h-4 w-4" />, profiles: SOLICITANTE },

  // ── Gestores intermediários (Supervisor e Consolidador) ──────
  { to: '/solicitar-produtos',  label: 'Solicitar Produtos', icon: <PlusSquare     className="h-4 w-4" />, profiles: GESTORES },
  { to: '/gestor/pedidos',      label: 'Pedidos Pendentes',  icon: <ClipboardCheck className="h-4 w-4" />, profiles: GESTORES },
  { to: '/gestor/homologados',  label: 'Homologados',        icon: <FileText       className="h-4 w-4" />, profiles: GESTORES },
  { to: '/meus-dados',          label: 'Meus Dados',         icon: <UserCircle     className="h-4 w-4" />, profiles: NAO_SOLICITANTE },

  // ── GESTOR_CARTOGRAFICO (DSG) ─────────────────────────────────
  { to: '/dsg/pedidos',    label: 'Pedidos DSG',      icon: <MapPin       className="h-4 w-4" />, profiles: DSG },
  { to: '/dsg/janelas',    label: 'Janelas',          icon: <Settings     className="h-4 w-4" />, profiles: DSG },
  { to: '/dsg/relatorios', label: 'Relatórios',       icon: <BarChart2    className="h-4 w-4" />, profiles: DSG },
  { to: '/admin/usuarios', label: 'Usuários',         icon: <Users        className="h-4 w-4" />, profiles: DSG },
  { to: '/admin/pedidos',  label: 'Todos os Pedidos', icon: <ShieldAlert  className="h-4 w-4" />, profiles: DSG },
  { to: '/admin/metricas', label: 'Métricas da API',  icon: <Activity     className="h-4 w-4" />, profiles: DSG },

  // ── ANALISTA_CGEO ─────────────────────────────────────────────
  { to: '/cgeo/pedidos', label: 'Análise CGEO', icon: <ClipboardCheck className="h-4 w-4" />, profiles: CGEO },

  // ── Comum a gestores e CGEO ───────────────────────────────────
  { to: '/ajuda', label: 'Ajuda', icon: <HelpCircle className="h-4 w-4" />, profiles: NAO_SOLICITANTE },
]

export function Sidebar() {
  const { user } = useAuthStore()
  const perfil = user?.perfil ?? ''

  const visible = navItems.filter(
    (item) => !item.profiles || item.profiles.includes(perfil)
  )

  return (
    <aside className="w-56 shrink-0 bg-zinc-900 border-r border-white/10 min-h-full">
      <nav className="p-3 space-y-0.5">
        {visible.map((item) => (
          <NavLink
            key={item.to + item.label}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
