import { create } from 'zustand'
import type { CartItem, ItemImpressao, MaterialImpressao, TipoProduto, Escala } from '../types/pedido'

/** Chave única de um item no carrinho — permite mesmo INOM em produtos/escalas distintos */
export function cartKey(item: Pick<CartItem, 'inom' | 'tipo_produto' | 'escala'>): string {
  return `${item.tipo_produto}|||${item.escala}|||${item.inom}`
}

interface CartState {
  items: CartItem[]
  tipoProduto: TipoProduto | null
  escala: Escala | null
  dataEntrega: string | null
  finalidadeGeo: string
  finalidade: string
  /** Entidades de impressão indexadas por ItemImpressao.id (== cartKey do item) */
  impressoes: Record<string, ItemImpressao>
  /** ID do rascunho em edição — quando definido, o submit cancela o pedido antigo e cria um novo */
  editingPedidoId: number | null
  addItem: (item: Omit<CartItem, 'impressao' | 'impressaoId'>) => void
  removeItem: (inom: string, tipoProduto?: TipoProduto, escala?: Escala) => void
  hasItem: (inom: string, tipoProduto?: TipoProduto, escala?: Escala) => boolean
  /** Cria ou atualiza a entidade de impressão associada ao item. */
  setItemImpressao: (itemKey: string, qty: number, tipo: MaterialImpressao) => void
  /** Remove a entidade de impressão e limpa os flags do item. */
  removeItemImpressao: (itemKey: string) => void
  setTipoProduto: (tipo: TipoProduto | null) => void
  setEscala: (escala: Escala | null) => void
  setDataEntrega: (date: string | null) => void
  setFinalidadeGeo: (v: string) => void
  setFinalidade: (f: string) => void
  setEditingPedidoId: (id: number | null) => void
  clear: () => void
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  tipoProduto: null,
  escala: null,
  dataEntrega: null,
  finalidadeGeo: '',
  finalidade: '',
  impressoes: {},
  editingPedidoId: null,

  addItem: (item) => {
    const key = cartKey(item)
    if (!get().items.some(i => cartKey(i) === key)) {
      set((s) => ({
        items: [...s.items, { ...item, impressao: false, impressaoId: null }],
      }))
    }
  },

  removeItem: (inom, tipoProduto, escala) => {
    const removed = tipoProduto && escala
      ? get().items.filter(i => i.inom === inom && i.tipo_produto === tipoProduto && i.escala === escala)
      : get().items.filter(i => i.inom === inom)

    const orphanKeys = removed.map(i => cartKey(i))
    set((s) => {
      const nextImpressoes = { ...s.impressoes }
      orphanKeys.forEach(k => delete nextImpressoes[k])
      return {
        items: tipoProduto && escala
          ? s.items.filter(i => !(i.inom === inom && i.tipo_produto === tipoProduto && i.escala === escala))
          : s.items.filter(i => i.inom !== inom),
        impressoes: nextImpressoes,
      }
    })
  },

  hasItem: (inom, tipoProduto, escala) =>
    tipoProduto && escala
      ? get().items.some(i => i.inom === inom && i.tipo_produto === tipoProduto && i.escala === escala)
      : get().items.some(i => i.inom === inom),

  setItemImpressao: (itemKey, qty, tipo) => {
    const imp: ItemImpressao = { id: itemKey, produtoId: itemKey, quantidade: qty, tipo }
    set((s) => ({
      impressoes: { ...s.impressoes, [itemKey]: imp },
      items: s.items.map(i =>
        cartKey(i) === itemKey ? { ...i, impressao: true, impressaoId: itemKey } : i
      ),
    }))
  },

  removeItemImpressao: (itemKey) =>
    set((s) => {
      const next = { ...s.impressoes }
      delete next[itemKey]
      return {
        impressoes: next,
        items: s.items.map(i =>
          cartKey(i) === itemKey ? { ...i, impressao: false, impressaoId: null } : i
        ),
      }
    }),

  setTipoProduto: (tipo) => set({ tipoProduto: tipo }),
  setEscala: (escala) => set({ escala }),
  setDataEntrega: (date) => set({ dataEntrega: date }),
  setFinalidadeGeo: (v) => set({ finalidadeGeo: v }),
  setFinalidade: (f) => set({ finalidade: f }),
  setEditingPedidoId: (id) => set({ editingPedidoId: id }),

  clear: () =>
    set({
      items: [],
      tipoProduto: null,
      escala: null,
      dataEntrega: null,
      finalidadeGeo: '',
      finalidade: '',
      impressoes: {},
      editingPedidoId: null,
    }),
}))
