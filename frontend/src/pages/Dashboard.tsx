import { Link } from 'react-router-dom'
import { PlusSquare, FileText, ClipboardCheck, MapPin, BarChart2, HelpCircle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { formatNomeComPosto } from '../data/postos'

export function Dashboard() {
  const { user, isGestor, isDSG, isCGEO } = useAuthStore()

  const isSolicitante = user?.perfil === 'SOLICITANTE'

  const cards = [
    // Solicitar Produtos — SOLICITANTE, SUPERVISOR e CONSOLIDADOR
    ...(isSolicitante || isGestor() ? [{
      to: '/solicitar-produtos',
      icon: <PlusSquare className="h-7 w-7 text-emerald-400" />,
      title: 'Solicitar Produtos',
      desc: 'Crie uma nova solicitação de produto geoinformacional',
    }] : []),
    // Meus Pedidos — apenas SOLICITANTE
    ...(isSolicitante ? [{
      to: '/meus-pedidos',
      icon: <FileText className="h-7 w-7 text-emerald-400" />,
      title: 'Meus Pedidos',
      desc: 'Acompanhe o status das suas solicitações',
    }] : []),
    ...(isGestor() ? [{
      to: '/gestor/pedidos',
      icon: <ClipboardCheck className="h-7 w-7 text-emerald-400" />,
      title: 'Pedidos Pendentes',
      desc: 'Revise e consolide pedidos do seu escalão',
    }] : []),
    ...(isDSG() ? [
      {
        to: '/dsg/pedidos',
        icon: <MapPin className="h-7 w-7 text-emerald-400" />,
        title: 'Gerenciar Pedidos',
        desc: 'Distribua pedidos consolidados para os CGEOs',
      },
      {
        to: '/dsg/relatorios',
        icon: <BarChart2 className="h-7 w-7 text-emerald-400" />,
        title: 'Relatórios',
        desc: 'Visualize métricas e estatísticas do sistema',
      },
    ] : []),
    ...(isCGEO() ? [{
      to: '/cgeo/pedidos',
      icon: <ClipboardCheck className="h-7 w-7 text-emerald-400" />,
      title: 'Análise de Pedidos',
      desc: 'Analise viabilidade dos pedidos atribuídos ao seu CGEO',
    }] : []),
    {
      to: '/ajuda',
      icon: <HelpCircle className="h-7 w-7 text-emerald-400" />,
      title: 'Ajuda',
      desc: '',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">
          {formatNomeComPosto(user?.nome ?? '', user?.posto_graduacao)}
        </h1>
        <p className="text-zinc-400 text-sm mt-1">
          {user?.om}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="group bg-zinc-900 border border-white/10 rounded-xl p-5 hover:border-emerald-500/30 hover:bg-zinc-800/60 transition-all duration-200"
          >
            <div className="mb-3">{card.icon}</div>
            <h2 className="font-semibold text-zinc-100 mb-1">{card.title}</h2>
            <p className="text-sm text-zinc-500 leading-relaxed">{card.desc}</p>
          </Link>
        ))}
      </div>

    </div>
  )
}
