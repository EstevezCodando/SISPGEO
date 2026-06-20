import { addDays, format } from "date-fns";
import { useEffect, useState } from "react";
import { type ConfigEntrega, configApi } from "../api/config";
import { janelasApi, type MinhaJanela } from "../api/janelas";
import { PRAZO_FALLBACK } from "../types/pedido";
import type { TipoProduto } from "../types/pedido";
import { useCartStore } from "../store/cartStore";
import { TIPOS_IMPRESSAO } from "../types/pedido";

/**
 * Encapsula os dados de configuração e cálculo de data mínima para o formulário
 * de solicitação de produtos. Os valores do carrinho (tipoProduto, escala, etc.)
 * permanecem no useCartStore — este hook complementa com dados da API de config.
 */
export function useSolicitarForm() {
  const {
    items,
    tipoProduto,
    escala,
    dataEntrega,
    finalidadeGeo,
    finalidade,
    impressoes,
    editingPedidoId,
    setTipoProduto,
    setEscala,
    setDataEntrega,
    setFinalidadeGeo,
    setFinalidade,
    setItemImpressao,
    removeItemImpressao,
    removeItem,
    clear,
  } = useCartStore();

  const [minhaJanela, setMinhaJanela] = useState<MinhaJanela | null>(null);
  const [configEntrega, setConfigEntrega] = useState<ConfigEntrega | null>(null);

  useEffect(() => {
    // Verifica janela ativa para este perfil
    janelasApi
      .minhaJanela()
      .then((r) => setMinhaJanela(r.data))
      .catch(() =>
        setMinhaJanela({
          aberta: true,
          data_inicio: null,
          data_fim: null,
          tipo_janela: null,
          dias_restantes: null,
          configurada: false,
        }),
      );
    // Carrega configuração global de datas mínimas de entrega
    configApi
      .getEntrega()
      .then((r) => setConfigEntrega(r.data))
      .catch(() => {});
  }, []);

  // minDate = data_base (global) + prazo_minimo do produto selecionado.
  // Se a configuração ainda não carregou, usa fallback local.
  const minDate = (() => {
    if (!tipoProduto) return format(addDays(new Date(), 1), "yyyy-MM-dd");
    if (configEntrega?.datas_minimas?.[tipoProduto]) {
      return configEntrega.datas_minimas[tipoProduto];
    }
    // fallback enquanto API carrega
    const prazo = PRAZO_FALLBACK[tipoProduto as TipoProduto] ?? 30;
    const base = configEntrega?.data_base
      ? new Date(configEntrega.data_base + "T00:00:00")
      : new Date();
    return format(addDays(base, prazo), "yyyy-MM-dd");
  })();

  const isImpressao = tipoProduto ? TIPOS_IMPRESSAO.has(tipoProduto) : false;

  return {
    // Carrinho
    items,
    tipoProduto,
    escala,
    dataEntrega,
    finalidadeGeo,
    finalidade,
    impressoes,
    editingPedidoId,
    setTipoProduto,
    setEscala,
    setDataEntrega,
    setFinalidadeGeo,
    setFinalidade,
    setItemImpressao,
    removeItemImpressao,
    removeItem,
    clear,
    // Config e janela
    minhaJanela,
    configEntrega,
    // Derivados
    minDate,
    isImpressao,
  };
}
