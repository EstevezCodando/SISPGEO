import { useCallback, useEffect, useRef, useState } from 'react'
import { usersApi } from '../api/users'
import { POLL_INTERVAL_MS } from '../constants'
import type { Notificacao } from '../types/user'

/**
 * Gerencia o estado e as operações de notificações do usuário.
 *
 * Estratégia de polling em dois níveis:
 *   - A cada POLL_INTERVAL_MS: busca APENAS a contagem de não-lidas (COUNT query leve)
 *   - Ao chamar fetchNotifications(): busca a lista completa (máx. 50 itens)
 */
export function useNotifications() {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingList, setLoadingList] = useState(false)
  const listFetchedRef = useRef(false)

  // ── Polling leve: apenas contagem de não-lidas ───────────────────────────
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await usersApi.getUnreadCount()
      setUnreadCount(res.data.unread)
    } catch {
      // silently ignore — user may be logging out
    }
  }, [])

  useEffect(() => {
    fetchUnreadCount()
    const timer = setInterval(fetchUnreadCount, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [fetchUnreadCount])

  // ── Lista completa: carregada apenas ao abrir o dropdown ─────────────────
  const fetchNotifications = useCallback(async () => {
    if (listFetchedRef.current) return
    setLoadingList(true)
    try {
      const res = await usersApi.getNotifications()
      setNotificacoes(res.data)
      setUnreadCount(res.data.filter((n: Notificacao) => !n.lida).length)
      listFetchedRef.current = true
    } catch {
      // silently ignore
    } finally {
      setLoadingList(false)
    }
  }, [])

  const marcarLida = useCallback(async (id: number) => {
    try {
      await usersApi.markNotificationRead(id)
      setNotificacoes((prev) =>
        prev.map((x) => (x.id === id ? { ...x, lida: true } : x))
      )
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      // ignore
    }
  }, [])

  const marcarTodasLidas = useCallback(async () => {
    const naoLidas = notificacoes.filter((n) => !n.lida)
    await Promise.allSettled(
      naoLidas.map((n) => usersApi.markNotificationRead(n.id))
    )
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })))
    setUnreadCount(0)
  }, [notificacoes])

  return {
    notificacoes,
    unreadCount,
    loadingList,
    fetchNotifications,
    marcarLida,
    marcarTodasLidas,
  }
}
