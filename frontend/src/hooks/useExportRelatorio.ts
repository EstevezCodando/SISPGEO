// SisPGeo — Sistema de Pedidos de Geoinformação
// © 2026 Estevez Alvarez <alvarez.jean@eb.mil.br>  ·  Software Engineer
// Regras de negócio: Raphael Perrut <perrut.raphael@eb.mil.br>  ·  Cartographic Engineer

import { useState } from 'react'
import toast from 'react-hot-toast'
import { pedidosApi } from '../api/pedidos'

/**
 * Hook que encapsula o download do relatório ZIP.
 * Usado em MeusPedidos (SOLICITANTE) e GestorDashboard (SUPERVISOR / CONSOLIDADOR).
 *
 * @returns { exportando, baixarRelatorio }
 */
export function useExportRelatorio() {
  const [exportando, setExportando] = useState(false)

  const baixarRelatorio = async () => {
    if (exportando) return
    setExportando(true)
    const toastId = toast.loading('Gerando pacote de pedidos…')
    try {
      const res = await pedidosApi.exportRelatorio()
      const blob = res.data as Blob
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url

      // Extrai nome do arquivo do header Content-Disposition, ou gera fallback
      const disposition = (res.headers as Record<string, string>)['content-disposition'] ?? ''
      const match = disposition.match(/filename=([^\s;]+)/)
      a.download = match?.[1] ?? `pedido_sispgeo_${new Date().toISOString().slice(0, 10)}.zip`

      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success('Pedidos baixados com sucesso', { id: toastId })
    } catch {
      toast.error('Erro ao baixar pedidos', { id: toastId })
    } finally {
      setExportando(false)
    }
  }

  return { exportando, baixarRelatorio }
}
