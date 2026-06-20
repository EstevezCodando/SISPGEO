import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import api from '../../api/client'

interface ProrrogacaoModalProps {
  onClose: () => void
  dataEncerramento: string
}

export function ProrrogacaoModal({ onClose, dataEncerramento }: ProrrogacaoModalProps) {
  const [justificativa, setJustificativa] = useState('')
  const [produtos, setProdutos] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!justificativa.trim() || !produtos.trim()) {
      toast.error('Preencha a justificativa e os produtos desejados')
      return
    }
    setSending(true)
    try {
      await api.post('/janelas/solicitar-prorrogacao', {
        justificativa: justificativa.trim(),
        produtos_desejados: produtos.trim(),
      })
      toast.success('Solicitação enviada ao escalão superior')
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail ?? 'Erro ao enviar solicitação')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-zinc-100 text-base">Solicitar prorrogação de prazo</h2>
          <p className="text-xs text-zinc-500 mt-1">
            O prazo encerrou em{' '}
            <span className="text-zinc-300 font-medium">
              {format(new Date(dataEncerramento), "dd/MM/yyyy", { locale: ptBR })}
            </span>
            . Sua solicitação será encaminhada como notificação ao escalão superior.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Justificativa <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={3}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Descreva o motivo pelo qual o prazo não pôde ser cumprido..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Produtos desejados <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={3}
              value={produtos}
              onChange={(e) => setProdutos(e.target.value)}
              placeholder="Liste os produtos, escalas e folhas INOM que deseja incluir na solicitação..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none transition-colors"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm text-zinc-400 border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={sending}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-400 disabled:opacity-50 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
              {sending ? 'Enviando...' : 'Enviar solicitação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
