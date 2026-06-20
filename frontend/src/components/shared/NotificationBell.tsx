/**
 * Sino de notificações com badge de não lidas e dropdown de itens recentes.
 *
 * Estratégia de polling em dois níveis para mínimo impacto no backend:
 *   - A cada 90 s: busca APENAS a contagem de não lidas (COUNT query — ínfimo)
 *   - Ao abrir o dropdown: busca a lista completa (máx. 50 itens)
 * Isso elimina a consulta pesada que bloqueava o event loop a cada minuto.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Info, AlertTriangle, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Notificacao } from '../../types/user'
import { useNotifications } from '../../hooks/useNotifications'

/** Ícone e cor de acordo com o título/tipo da notificação */
function NotifIcon({ titulo }: { titulo: string }) {
  const t = titulo.toLowerCase()
  if (t.includes('aprovad') || t.includes('pronto') || t.includes('concluíd'))
    return <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
  if (t.includes('reprovad') || t.includes('cancel') || t.includes('recusad'))
    return <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
  if (t.includes('devolv') || t.includes('revisão') || t.includes('revis'))
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
  if (t.includes('prazo') || t.includes('encerr') || t.includes('janela'))
    return <Clock className="h-3.5 w-3.5 shrink-0 text-orange-400" />
  return <Info className="h-3.5 w-3.5 shrink-0 text-sky-400" />
}

export function NotificationBell() {
  const {
    notificacoes: notifications,
    unreadCount,
    loadingList,
    fetchNotifications,
    marcarLida,
    marcarTodasLidas,
  } = useNotifications()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const handleToggleOpen = () => {
    setOpen((o) => {
      if (!o) fetchNotifications() // busca lista ao abrir
      return !o
    })
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleMarkRead = async (n: Notificacao) => {
    if (!n.lida) {
      await marcarLida(n.id)
    }
    if (n.pedido_id) {
      navigate('/meus-pedidos')
    }
    setOpen(false)
  }

  const handleMarkAllRead = async () => {
    await marcarTodasLidas()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={handleToggleOpen}
        className={`relative p-2 rounded-lg transition-colors ${
          open
            ? 'bg-white/10 text-zinc-200'
            : 'hover:bg-white/5 text-zinc-400 hover:text-zinc-200'
        }`}
        title="Notificações"
        aria-label={`Notificações — ${unreadCount} não lidas`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white leading-none ring-2 ring-zinc-900">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown — z-[200] garante ficar acima do ProductTicker e abaixo de modais */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] bg-zinc-900 border border-white/10 rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.7)] z-[200] overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-zinc-800/50">
            <div className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-sm font-semibold text-zinc-100">Notificações</span>
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-emerald-400 transition-colors"
                title="Marcar todas como lidas"
              >
                <CheckCheck className="h-3 w-3" />
                Marcar todas
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-white/[0.04]">
            {loadingList ? (
              <div className="flex items-center justify-center gap-2 py-10 text-zinc-500 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                Carregando…
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                <Bell className="h-8 w-8 text-zinc-700" />
                <p className="text-sm text-zinc-500">Nenhuma notificação ainda.</p>
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleMarkRead(n)}
                  className={`w-full text-left px-4 py-3 transition-colors group ${
                    n.lida
                      ? 'hover:bg-white/[0.03]'
                      : 'bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Ícone tipo notificação */}
                    <div className={`mt-0.5 p-1.5 rounded-md shrink-0 ${
                      n.lida ? 'bg-white/5' : 'bg-white/10'
                    }`}>
                      <NotifIcon titulo={n.titulo} />
                    </div>

                    {/* Conteúdo */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-[13px] font-semibold leading-snug ${
                          n.lida ? 'text-zinc-400' : 'text-zinc-100'
                        }`}>
                          {n.titulo}
                        </p>
                        {!n.lida && (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400 ring-2 ring-zinc-900" />
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 leading-relaxed ${
                        n.lida ? 'text-zinc-600' : 'text-zinc-400'
                      }`}>
                        {n.mensagem}
                      </p>
                      <p
                        className="text-[10px] text-zinc-600 mt-1.5 group-hover:text-zinc-500 transition-colors"
                        title={format(new Date(n.criado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      >
                        {formatDistanceToNow(new Date(n.criado_em), {
                          locale: ptBR,
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-white/[0.06] bg-zinc-900/80">
              <p className="text-[10px] text-zinc-600 text-center">
                Mostrando as {Math.min(notifications.length, 20)} notificações mais recentes
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
