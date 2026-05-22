import { create } from 'zustand'
import type { CartItem, TipoProduto, Escala } from '../types/pedido'

/** Chave única de um item no carrinho — permite mesmo INOM em produtos/escalas distintos */
export function cartKey(item: Pick<CartItem, 'inom' | 'tipo_produto' | 'escala'>): string {
  return `${item.tipo_produto}|||${item.escala}|||${item.inom}`
}

interface CartState {
  items: CartItem[]
  tipoProduto: TipoProduto | null
  escala: Escala | null
  dataEntrega: string | null
  operacaoId: number | null
  finalidade: string
  addItem: (item: CartItem) => void
  removeItem: (inom: string, tipoProduto?: TipoProduto, escala?: Escala) => void
  hasItem: (inom: string, tipoProduto?: TipoProduto, escala?: Escala) => boolean
  setTipoProduto: (tipo: TipoProduto | null) => void
  setEscala: (escala: Escala | null) => void
  setDataEntrega: (date: string | null) => void
  setOperacaoId: (id: number | null) => void
  setFinalidade: (f: string) => void
  clear: () => void
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  tipoProduto: null,
  escala: null,
  dataEntrega: null,
  operacaoId: null,
  finalidade: '',

  addItem: (item) => {
    const key = cartKey(item)
    if (!get().items.some(i => cartKey(i) === key)) {
      set((s) => ({ items: [...s.items, item] }))
    }
  },

  // Se tipoProduto+escala informados: remove item específico
  // Sem eles: remove qualquer item com esse inom (comportamento legado)
  removeItem: (inom, tipoProduto, escala) =>
    set((s) => ({
      items: tipoProduto && escala
        ? s.items.filter(i => !(i.inom === inom && i.tipo_produto === tipoProduto && i.escala === escala))
        : s.items.filter(i => i.inom !== inom),
    })),

  // Se tipoProduto+escala informados: verifica combo específico
  // Sem eles: verifica qualquer item com esse inom (legado — usado na seleção do mapa)
  hasItem: (inom, tipoProduto, escala) =>
    tipoProduto && escala
      ? get().items.some(i => i.inom === inom && i.tipo_produto === tipoProduto && i.escala === escala)
      : get().items.some(i => i.inom === inom),

  setTipoProduto: (tipo) => set({ tipoProduto: tipo }),
  setEscala: (escala) => set({ escala }),
  setDataEntrega: (date) => set({ dataEntrega: date }),
  setOperacaoId: (id) => set({ operacaoId: id }),
  setFinalidade: (f) => set({ finalidade: f }),

  clear: () =>
    set({
      items: [],
      tipoProduto: null,
      escala: null,
      dataEntrega: null,
      operacaoId: null,
      finalidade: '',
    }),
}))
