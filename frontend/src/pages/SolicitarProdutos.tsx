import { addDays, format } from "date-fns";
import type { Feature, FeatureCollection } from "geojson";
import L from "leaflet";
import {
    AlertTriangle,
    Building2,
    CalendarX,
    Check,
    ClipboardCheck,
    Loader2,
    Lock,
    Map as MapIcon,
    Pencil,
    Phone,
    Satellite,
    ShoppingCart,
    Trash2,
    User,
    X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { configApi, type ConfigEntrega } from "../api/config";
import { janelasApi, type MinhaJanela } from "../api/janelas";
import { pedidosApi } from "../api/pedidos";
import { InteractiveMap, type Basemap } from "../components/map/InteractiveMap";
import { PedidosMap } from "../components/map/PedidosMap";
import { formatNomeComPosto } from "../data/postos";
import { useAuthStore } from "../store/authStore";
import { cartKey, useCartStore } from "../store/cartStore";
import type { CartItem, Escala, TipoProduto } from "../types/pedido";
import {
    MATERIAIS_IMPRESSAO,
    TIPO_PRODUTO_LABELS,
    TIPOS_IMPRESSAO,
} from "../types/pedido";

const ESCALAS: Escala[] = ["1:25.000", "1:50.000", "1:100.000", "1:250.000"];

// Prazos mínimos locais — usados como fallback se a API ainda não respondeu.
// Valores autoritativos vêm de GET /config/entrega (PRAZOS_MINIMOS no backend).
const PRAZO_FALLBACK: Record<TipoProduto, number> = {
  CARTA_TOPOGRAFICA: 180,
  CARTA_ORTOIMAGEM: 60,
  ORTOIMAGEM: 40,
  MDT: 40,
  MDS: 40,
  CDGV: 180,
  IMPRESSAO_CT: 30,
  IMPRESSAO_COI: 30,
  IMPRESSAO: 30, // legado
};

// Tipos de produto exibidos no dropdown (sem IMPRESSAO legado)
const TIPOS_PRODUTO_VISIVEIS: TipoProduto[] = [
  "CARTA_TOPOGRAFICA",
  "CARTA_ORTOIMAGEM",
  "ORTOIMAGEM",
  "MDT",
  "MDS",
  "CDGV",
  "IMPRESSAO_CT",
  "IMPRESSAO_COI",
];

const FINALIDADES_GEO = [
  "Operação Militar",
  "Exercício Combinado",
  "Exercício Integrador",
  "Manobra Escolar",
  "Instrução Militar",
  "Atualização de Campo de Instrução",
  "Outra",
] as const;

const inputCls =
  "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const labelCls = "block text-xs font-medium text-zinc-400 mb-1";

// ── Camada GeoJSON vanilla Leaflet (dentro de MapContainer) ──────────────────
// Usa L.geoJSON + useMap para garantir tooltips funcionando 100%.
// O prop `itemMap` fornece o MI do CartItem como fallback quando
// feature.properties.mi está nulo (comum em escalas sem dado MI no BDGEx).
function RevisaoGeoJSONLayer({
  geojson,
  itemMap,
}: {
  geojson: FeatureCollection;
  itemMap: Map<string, CartItem>;
}) {
  const map = useMap();

  useEffect(() => {
    const layer = L.geoJSON(geojson, {
      style: () => ({
        color: "#3b82f6",
        weight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.35,
      }),
      onEachFeature: (feature: Feature, lyr: L.Layer) => {
        const props = (feature.properties ?? {}) as {
          inom?: string;
          mi?: string | null;
        };
        const inom = props.inom ?? "—";
        const cartItem = itemMap.get(inom);
        // Prioridade: feature.properties.mi → CartItem.mi → ausente
        const mi = props.mi ?? cartItem?.mi ?? null;
        const tip = mi
          ? `<b style="color:#34d399">${mi}</b><br><span style="color:#a1a1aa;font-size:11px">${inom}</span>` +
            (cartItem
              ? `<br><span style="color:#71717a">${TIPO_PRODUTO_LABELS[cartItem.tipo_produto]} · ${cartItem.escala}</span>`
              : "")
          : `<b>${inom}</b>` +
            (cartItem
              ? `<br><span style="color:#71717a">${TIPO_PRODUTO_LABELS[cartItem.tipo_produto]} · ${cartItem.escala}</span>`
              : "");
        lyr.bindTooltip(tip, {
          sticky: true,
          className: "leaflet-dark-tooltip",
        });
      },
    }).addTo(map);

    // Ajusta o zoom para as células selecionadas
    try {
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    } catch {
      /* ignore */
    }

    return () => {
      layer.remove();
    };
  }, [geojson, map, itemMap]);

  return null;
}

// ── Modal de Revisão ──────────────────────────────────────────────────────────
interface RevisaoModalProps {
  items: CartItem[];
  impressoes: Record<string, import("../types/pedido").ItemImpressao>;
  onRemoveItem: (item: CartItem) => void;
  onSetItemImpressao: (
    key: string,
    qty: number,
    tipo: import("../types/pedido").MaterialImpressao,
  ) => void;
  onRemoveItemImpressao: (key: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
  isImpressao: boolean;
  finalidadeGeo: string;
  finalidade: string;
  onSetFinalidade: (v: string) => void;
}

function RevisaoModal({
  items,
  impressoes,
  onRemoveItem,
  onSetItemImpressao,
  onRemoveItemImpressao,
  onClose,
  onConfirm,
  submitting,
  isImpressao,
  finalidadeGeo,
  finalidade,
  onSetFinalidade,
}: RevisaoModalProps) {
  const { user } = useAuthStore();

  // Fonte de geometrias: carregada uma única vez ao abrir o modal
  const [rawGrid, setRawGrid] = useState<FeatureCollection | null>(null);
  const [loadingMap, setLoadingMap] = useState(true);

  // Lookup MI/produto por INOM para tooltip no mapa
  const itemMap = useMemo(
    () =>
      new Map<string, CartItem>(
        items.map((i) => [i.inom, i] as [string, CartItem]),
      ),
    [items],
  );

  useEffect(() => {
    if (items.length === 0) {
      setLoadingMap(false);
      return;
    }
    api
      .post(
        "/map/features-preview",
        items.map((i) => ({
          inom: i.inom,
          escala: i.escala,
          tipo_produto: i.tipo_produto,
        })),
      )
      .then((r) => setRawGrid(r.data as FeatureCollection))
      .catch(() => {
        /* mapa fica sem geometrias — não bloqueia o fluxo */
      })
      .finally(() => setLoadingMap(false));
  }, []); // só na abertura — geometrias ficam em rawGrid

  // Filtra rawGrid pelos INOMs que ainda estão no carrinho (reage a remoções)
  const filteredGrid = useMemo<FeatureCollection | null>(() => {
    if (!rawGrid) return null;
    const currentInoms = new Set(items.map((i) => i.inom));
    const features = rawGrid.features.filter(
      (f) => f.properties && currentInoms.has(f.properties.inom as string),
    );
    return features.length > 0 ? { type: "FeatureCollection", features } : null;
  }, [rawGrid, items]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-emerald-400" />
              Resumo dos Pedidos
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {items.length} produto{items.length !== 1 ? "s" : ""} selecionado
              {items.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 gap-0">
          {/* Coluna esquerda — Mapa */}
          <div className="flex-1 min-w-0 border-r border-white/10 relative">
            {loadingMap ? (
              <div className="h-full flex items-center justify-center gap-2 text-zinc-400 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                Carregando mapa…
              </div>
            ) : filteredGrid && filteredGrid.features.length > 0 ? (
              <MapContainer
                center={[-15, -52]}
                zoom={5}
                style={{
                  height: "100%",
                  width: "100%",
                  minHeight: 320,
                  background: "#18181b",
                }}
                zoomControl
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="© OpenStreetMap"
                />
                <RevisaoGeoJSONLayer geojson={filteredGrid} itemMap={itemMap} />
              </MapContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500 text-sm p-6 text-center">
                Nenhum produto com geometria carregada
              </div>
            )}
          </div>

          {/* Coluna direita — Dados e itens */}
          <div className="w-80 shrink-0 flex flex-col overflow-hidden">
            {/* Dados do solicitante */}
            <div className="px-5 py-4 border-b border-white/10 bg-zinc-800/30">
              <p className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wide">
                Solicitante
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-zinc-300">
                  <User className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  <span className="font-medium">
                    {user
                      ? formatNomeComPosto(
                          user.nome,
                          user.posto_graduacao,
                          user.nome_de_guerra,
                        )
                      : "-"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <Building2 className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  <span>{user?.om ?? "—"}</span>
                </div>
                {user?.telefone && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Phone className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                    <span>{user.telefone}</span>
                  </div>
                )}
                <div className="text-zinc-500 truncate">
                  {user?.email ?? "—"}
                </div>
              </div>
            </div>

            {/* Lista de itens + Impressão (área rolável) */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* Carrinho */}
              <div>
                <p className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                  <ShoppingCart className="h-3.5 w-3.5 text-emerald-400" />
                  Carrinho ({items.length})
                </p>
                <div className="space-y-2">
                  {items.map((item) => {
                    const key = cartKey(item);
                    const imp = impressoes[key];
                    return (
                      <div
                        key={key}
                        className="bg-zinc-800/60 border border-zinc-700/40 rounded-lg px-3 py-2 text-xs space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {item.mi ? (
                              <>
                                <p className="font-medium text-emerald-400 truncate">
                                  MI: {item.mi}
                                </p>
                                <p className="font-mono text-zinc-500 text-[10px] truncate">
                                  Ind Nom: {item.inom}
                                </p>
                              </>
                            ) : (
                              <p className="font-mono font-medium text-emerald-400 truncate">
                                Ind Nom: {item.inom}
                              </p>
                            )}
                            <p className="text-zinc-400">
                              {TIPO_PRODUTO_LABELS[item.tipo_produto]}
                            </p>
                            <p className="text-zinc-500">{item.escala}</p>
                          </div>
                          <button
                            onClick={() => onRemoveItem(item)}
                            className="text-zinc-600 hover:text-red-400 transition-colors mt-0.5 shrink-0"
                            title="Remover item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Impressão por item */}
                        {TIPOS_IMPRESSAO.has(item.tipo_produto) ? (
                          // Produto de impressão: campos obrigatórios
                          <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-white/5">
                            <div>
                              <label className="block text-[10px] text-zinc-500 mb-1">
                                Qtd. <span className="text-red-400">*</span>
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={999}
                                value={imp?.quantidade ?? ""}
                                onChange={(e) => {
                                  const qty = e.target.value
                                    ? Number(e.target.value)
                                    : 0;
                                  if (qty > 0)
                                    onSetItemImpressao(
                                      key,
                                      qty,
                                      imp?.tipo ?? "Sulfite",
                                    );
                                  else onRemoveItemImpressao(key);
                                }}
                                placeholder="Qtd."
                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-zinc-500 mb-1">
                                Material <span className="text-red-400">*</span>
                              </label>
                              <select
                                value={imp?.tipo ?? "Sulfite"}
                                onChange={(e) => {
                                  const tipo = e.target
                                    .value as import("../types/pedido").MaterialImpressao;
                                  if (tipo)
                                    onSetItemImpressao(
                                      key,
                                      imp?.quantidade ?? 1,
                                      tipo,
                                    );
                                }}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              >
                                {MATERIAIS_IMPRESSAO.map((m) => (
                                  <option
                                    key={m}
                                    value={m}
                                    className="bg-zinc-800"
                                  >
                                    {m}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ) : (
                          // Produto digital: impressão opcional por item
                          <div className="pt-1 border-t border-white/5">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={item.impressao}
                                onChange={(e) => {
                                  if (e.target.checked)
                                    onSetItemImpressao(key, 1, "Sulfite");
                                  else onRemoveItemImpressao(key);
                                }}
                                className="accent-emerald-500"
                              />
                              <span className="text-[10px] text-zinc-400">
                                Imprimir Produto
                              </span>
                            </label>
                            {item.impressao && (
                              <div className="grid grid-cols-2 gap-1.5 mt-1.5 pl-4">
                                <div>
                                  <label className="block text-[10px] text-zinc-500 mb-1">
                                    Qtd. <span className="text-red-400">*</span>
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={999}
                                    value={imp?.quantidade ?? ""}
                                    onChange={(e) => {
                                      const qty = e.target.value
                                        ? Number(e.target.value)
                                        : 1;
                                      onSetItemImpressao(
                                        key,
                                        qty,
                                        imp?.tipo ?? "Sulfite",
                                      );
                                    }}
                                    placeholder="Qtd."
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-zinc-500 mb-1">
                                    Material{" "}
                                    <span className="text-red-400">*</span>
                                  </label>
                                  <select
                                    value={imp?.tipo ?? "Sulfite"}
                                    onChange={(e) => {
                                      const tipo = e.target
                                        .value as import("../types/pedido").MaterialImpressao;
                                      if (tipo)
                                        onSetItemImpressao(
                                          key,
                                          imp?.quantidade ?? 1,
                                          tipo,
                                        );
                                    }}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  >
                                    {MATERIAIS_IMPRESSAO.map((m) => (
                                      <option
                                        key={m}
                                        value={m}
                                        className="bg-zinc-800"
                                      >
                                        {m}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Informação Complementar — fixa, sempre visível */}
        <div className="px-4 py-3 border-t border-white/10 shrink-0 bg-zinc-900/60">
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide text-amber-400">
            Informação Complementar <span className="text-red-400">*</span>
          </label>
          {finalidadeGeo && (
            <span className="inline-block mb-1.5 px-2 py-0.5 rounded-full bg-zinc-700/60 border border-zinc-600/40 text-[10px] text-zinc-400">
              Finalidade da Geoinformação: {finalidadeGeo}
            </span>
          )}
          <textarea
            value={finalidade}
            onChange={(e) => onSetFinalidade(e.target.value)}
            rows={3}
            placeholder="Complementar com informações adicionais acerca da finalidade do pedido (mínimo de 10 caracteres)."
            className="w-full bg-zinc-800 border border-amber-500/50 rounded-lg px-2.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 resize-none transition-colors"
          />
          {finalidade.trim().length > 0 &&
            finalidade.trim().length < 10 && (
              <p className="text-[11px] text-amber-400 mt-1">
                {10 - finalidade.trim().length} caractere(s) restante(s)
              </p>
            )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-white/10 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-colors"
          >
            Voltar
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting || items.length === 0}
            className="flex-1 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            <Check className="h-4 w-4" />
            {submitting ? "Enviando..." : "Confirmar Pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export function SolicitarProdutos() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
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

  const isImpressao = tipoProduto ? TIPOS_IMPRESSAO.has(tipoProduto) : false;

  const [inomGrid, setInomGrid] = useState<FeatureCollection | null>(null);
  const [isLoadingGrid, setIsLoadingGrid] = useState(false);
  // Cache de grades por (tipoProduto|||escala) — evita re-fetch e re-parse ao alternar produtos
  const gridCacheRef = useRef<Map<string, FeatureCollection>>(new Map());
  const [showData, setShowData] = useState(true);
  const [basemap, setBasemap] = useState<Basemap>("osm");
  const [showPedidosMap, setShowPedidosMap] = useState(false);
  const [showRevisao, setShowRevisao] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [minhaJanela, setMinhaJanela] = useState<MinhaJanela | null>(null);
  const [configEntrega, setConfigEntrega] = useState<ConfigEntrega | null>(
    null,
  );
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

  useEffect(() => {
    // Limpa o grid imediatamente ao resetar selecção — impede grid antigo no remount
    if (!escala || !dataEntrega || !tipoProduto) {
      setInomGrid(null);
      return;
    }
    const cacheKey = `${tipoProduto}|||${escala}`;
    // Serve do cache instantaneamente (sem rede, sem re-parse)
    if (gridCacheRef.current.has(cacheKey)) {
      setInomGrid(gridCacheRef.current.get(cacheKey)!);
      return;
    }
    const controller = new AbortController();
    setIsLoadingGrid(true);
    api
      .get("/map/inom-grid", {
        params: { scale: escala, tipo_produto: tipoProduto },
        signal: controller.signal,
      })
      .then((r) => {
        const data = r.data as FeatureCollection;
        gridCacheRef.current.set(cacheKey, data);
        setInomGrid(data);
      })
      .catch((err) => {
        if (err?.code === "ERR_CANCELED") return;
        toast.error("Erro ao carregar grade INOM");
      })
      .finally(() => setIsLoadingGrid(false));
    return () => controller.abort();
  }, [escala, dataEntrega, tipoProduto]);

  // Todos os produtos: data mínima fev/2027 por política DSG.
  const POLICY_FLOOR = "2027-02-01";

  // minDate = max(prazo de produção, piso de política)
  const minDate = (() => {
    if (!tipoProduto) return POLICY_FLOOR;
    let calculated: string;
    if (configEntrega?.datas_minimas?.[tipoProduto]) {
      calculated = configEntrega.datas_minimas[tipoProduto];
    } else {
      // fallback enquanto API carrega — usa data atual como base se data_base ainda não veio
      const prazo = PRAZO_FALLBACK[tipoProduto];
      const base = configEntrega?.data_base
        ? new Date(configEntrega.data_base + "T00:00:00")
        : new Date();
      calculated = format(addDays(base, prazo), "yyyy-MM-dd");
    }
    return calculated >= POLICY_FLOOR ? calculated : POLICY_FLOOR;
  })();

  const handleSubmit = async () => {
    if (items.length === 0) {
      toast.error("Adicione ao menos um produto");
      return;
    }
    if (!dataEntrega) {
      toast.error("Informe a data de entrega");
      return;
    }
    if (finalidade.trim().length < 10) {
      toast.error(
        "Favor preencher a Informação Complementar.",
      );
      return;
    }
    const itensImpressao = items.filter((i) => TIPOS_IMPRESSAO.has(i.tipo_produto));
    if (itensImpressao.length > 0) {
      const semImpressao = itensImpressao.filter((i) => !impressoes[cartKey(i)]);
      if (semImpressao.length > 0) {
        toast.error(
          `Configure quantidade e material para ${semImpressao.length} item(ns) de impressão`,
        );
        return;
      }
    }
    if (!user?.orgao_vinculante) {
      toast.error(
        "Seu perfil não tem órgão vinculante configurado. Contate o Gestor Cartográfico (DSG) pelo telefone (61) 3415-5237 ou 860-5237 (RITEx).",
      );
      return;
    }

    setSubmitting(true);
    try {
      // Modo edição: cancela o rascunho anterior antes de criar o novo
      if (editingPedidoId) {
        await pedidosApi.cancel(editingPedidoId);
      }

      const pedido = await pedidosApi.create({
        operacao_id: null,
        data_entrega: dataEntrega,
        finalidade_geo: finalidadeGeo || null,
        finalidade: finalidade || null,
        itens: items.map((i) => {
          const imp = impressoes[cartKey(i)];
          return {
            tipo_produto: i.tipo_produto,
            escala: i.escala,
            inom: i.inom,
            mi: i.mi,
            solicitar_mesmo_disponivel: i.solicitar_mesmo_disponivel,
            disponivel_bdgex: i.disponivel_bdgex,
            data_producao_bdgex: i.data_producao_bdgex ?? null,
            impressao_quantidade: imp?.quantidade ?? null,
            impressao_tipo_material: imp?.tipo ?? null,
          };
        }),
        impressao_solicitada: items.some((i) => i.impressao),
      });

      const { isGestor } = useAuthStore.getState();
      const isSupervisorOrConsolidador = isGestor();

      if (isSupervisorOrConsolidador) {
        // Supervisor/Consolidador: auto-submete para entrar direto na fila de pendentes
        await pedidosApi.submit(pedido.data.id);
        toast.success(`Pedido #${pedido.data.id} enviado para análise!`);
        clear();
        setShowRevisao(false);
        navigate("/gestor/pedidos");
      } else {
        // Solicitante: salva em RASCUNHO — envio acontece em Meus Pedidos
        const msg = editingPedidoId
          ? `Pedido atualizado! Novo rascunho #${pedido.data.id} salvo.`
          : `Pedido #${pedido.data.id} salvo! Acesse Ver Pedidos para gerenciar.`;
        toast.success(msg);
        clear();
        setShowRevisao(false);
        navigate("/meus-pedidos");
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail ?? "Erro ao submeter pedido");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenRevisao = () => {
    if (items.length === 0) {
      toast.error("Adicione ao menos um produto ao carrinho");
      return;
    }
    if (!dataEntrega) {
      toast.error("Informe a data sugerida de entrega");
      return;
    }
    if (!finalidadeGeo) {
      toast.error("Selecione a finalidade da geoinformação");
      return;
    }
    setShowRevisao(true);
  };

  // Bloqueia SOLICITANTE sempre que a janela não estiver aberta (incluindo quando não há janela configurada).
  // Aguarda o carregamento (minhaJanela === null) antes de bloquear para evitar falso positivo.
  const janelaFechada =
    user?.perfil === "SOLICITANTE" &&
    minhaJanela !== null &&
    !minhaJanela?.aberta;

  if (janelaFechada) {
    const proximaAbertura = minhaJanela?.data_inicio
      ? new Date(minhaJanela.data_inicio) > new Date()
        ? new Date(minhaJanela.data_inicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
        : null
      : null;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-10 max-w-md w-full shadow-2xl">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-zinc-800 rounded-full">
              <CalendarX className="h-10 w-10 text-zinc-500" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-zinc-300 mb-2">
            Período de Solicitações Encerrado
          </h2>
          <p className="text-sm text-zinc-500 leading-relaxed mb-6">
            Não é possível realizar pedidos fora do prazo.{" "}
            {proximaAbertura
              ? `A janela de solicitações abrirá em ${proximaAbertura}.`
              : "Aguarde a janela de solicitações ser aberta pela DSG."}
          </p>
          {minhaJanela?.data_fim && new Date(minhaJanela.data_fim) < new Date() && (
            <p className="text-xs text-zinc-600 mb-4">
              Encerrado em{" "}
              {new Date(minhaJanela.data_fim).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          )}
          <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-left">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300/80 leading-relaxed">
              Caso haja necessidade de alteração, entre em contato com a{" "}
              <strong className="text-amber-300">
                SSGeoInt do seu Cmd Mil A enquadrante
              </strong>{" "}
              ou o órgão ao qual o Sr. está subordinado.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-500">
            <Lock className="h-3.5 w-3.5" />
            Acesso bloqueado pela DSG
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
            {editingPedidoId
              ? `Editar Pedido #${editingPedidoId}`
              : "Solicitar Produtos"}
          </h1>
        </div>
        <button
          onClick={() => setShowPedidosMap((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            showPedidosMap
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200 hover:border-zinc-600"
          }`}
        >
          <MapIcon className="h-4 w-4" />
          {showPedidosMap
            ? "Ocultar pedidos anteriores"
            : "Visualizar pedidos anteriores"}
        </button>
      </div>

      {/* Banner modo edição */}
      {editingPedidoId && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/25 rounded-xl shrink-0">
          <Pencil className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-200">
              Editando Pedido #{editingPedidoId}
            </p>
            <p className="text-xs text-amber-300/70 mt-0.5 leading-relaxed">
              Os produtos abaixo já foram carregados. Adicione ou remova itens
              no mapa e ajuste os campos. Ao confirmar, o rascunho anterior será
              substituído.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              clear();
              navigate("/meus-pedidos");
            }}
            className="shrink-0 text-xs text-amber-400 hover:text-amber-300 transition-colors font-medium"
          >
            Cancelar edição
          </button>
        </div>
      )}

      {showPedidosMap && (
        <div
          className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden shrink-0"
          style={{ height: "340px" }}
        >
          <PedidosMap className="w-full h-full" />
        </div>
      )}

      {/* Seletores */}
      <div className="bg-zinc-900 border border-white/10 rounded-xl p-4 shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Tipo de Produto / Serviço */}
          <div>
            <label className={labelCls}>Tipo de Produto / Serviço</label>
            <select
              value={tipoProduto ?? ""}
              onChange={(e) => {
                const novo = (e.target.value as TipoProduto) || null;
                setTipoProduto(novo);
                setEscala(null);
                setDataEntrega(null);
              }}
              className={inputCls}
            >
              <option value="" className="bg-zinc-800">
                Selecione...
              </option>
              {TIPOS_PRODUTO_VISIVEIS.map((k) => (
                <option key={k} value={k} className="bg-zinc-800">
                  {TIPO_PRODUTO_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          {/* Escala */}
          <div>
            <label className={labelCls}>Escala de Representação</label>
            <select
              value={escala ?? ""}
              onChange={(e) => {
                setEscala((e.target.value as Escala) || null);
                setDataEntrega(null);
              }}
              disabled={!tipoProduto}
              className={inputCls}
            >
              <option value="" className="bg-zinc-800">
                Selecione...
              </option>
              {ESCALAS.map((s) => (
                <option key={s} value={s} className="bg-zinc-800">
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Finalidade da Geoinformação */}
          <div>
            <label className={labelCls}>Finalidade da Geoinformação</label>
            <select
              value={finalidadeGeo}
              onChange={(e) => setFinalidadeGeo(e.target.value)}
              className={inputCls}
            >
              <option value="" className="bg-zinc-800">
                Selecione...
              </option>
              {FINALIDADES_GEO.map((fg) => (
                <option key={fg} value={fg} className="bg-zinc-800">
                  {fg}
                </option>
              ))}
            </select>
          </div>

          {/* Data de Entrega */}
          <div>
            <label className={labelCls}>Data Sugerida de Entrega</label>
            <input
              type="date"
              value={dataEntrega ?? ""}
              min={minDate}
              onChange={(e) => setDataEntrega(e.target.value || null)}
              disabled={!escala}
              className={inputCls}
            />
            {tipoProduto && minDate && (
              <p className="text-[11px] text-zinc-600 mt-1">
                Mínimo:{" "}
                <span className="text-zinc-400">
                  {new Date(minDate + "T00:00:00").toLocaleDateString("pt-BR")}
                </span>
                {configEntrega && (
                  <span className="text-zinc-600">
                    {" "}
                    (+
                    {configEntrega.prazos_minimos[tipoProduto] ??
                      PRAZO_FALLBACK[tipoProduto]}
                    d a partir de{" "}
                    {new Date(
                      configEntrega.data_base + "T00:00:00",
                    ).toLocaleDateString("pt-BR")}
                    )
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Mapa + Carrinho */}
      <div className="flex flex-1 gap-4 min-h-0">
        <div className="flex-1 min-h-[520px] bg-zinc-900 border border-white/10 rounded-xl overflow-hidden relative">
          {!escala || !dataEntrega ? (
            <div className="h-full flex items-center justify-center text-zinc-500 text-sm p-8 text-center">
              Selecione tipo de produto, escala e data de entrega para carregar
              o mapa
            </div>
          ) : (
            <>
              {/* Painel de camada */}
              <div className="absolute top-3 right-3 z-[1000] bg-zinc-900/90 backdrop-blur-sm border border-white/10 rounded-lg p-2.5 text-xs shadow-lg">
                {/* Switcher de basemap */}
                <div className="flex gap-1 mb-2.5">
                  <button
                    onClick={() => setBasemap("osm")}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      basemap === "osm"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                    }`}
                  >
                    <MapIcon className="h-3 w-3" /> OSM
                  </button>
                  <button
                    onClick={() => setBasemap("satellite")}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      basemap === "satellite"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                    }`}
                  >
                    <Satellite className="h-3 w-3" /> Satélite
                  </button>
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-zinc-300 mb-2">
                  <input
                    type="checkbox"
                    checked={showData}
                    onChange={(e) => setShowData(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  Dados do BDGEx
                </label>
                {showData && (
                  <div className="space-y-0.5 text-zinc-400">
                    {[
                      { color: "#10b981", label: "< 5 anos" },
                      { color: "#84cc16", label: "6–10 anos" },
                      { color: "#eab308", label: "11–15 anos" },
                      { color: "#f97316", label: "16–20 anos" },
                      { color: "#ef4444", label: "> 21 anos" },
                      { color: "#f1f1f300", label: "Sem dados" },
                    ].map((l) => (
                      <div key={l.color} className="flex items-center gap-1.5">
                        <span
                          className="w-3 h-3 rounded-sm inline-block border border-white/10 shrink-0"
                          style={{ background: l.color }}
                        />
                        {l.label}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 pt-2 border-t border-white/10 space-y-0.5 text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block border border-blue-500/50 bg-blue-500/30 shrink-0" />
                    Selecionado
                  </div>
                </div>
              </div>
              <div className="relative flex-1">
                <InteractiveMap
                  key={`${tipoProduto ?? "none"}|||${escala ?? "none"}`}
                  inomGrid={inomGrid}
                  showData={showData}
                  basemap={basemap}
                  somenteBdgex={isImpressao}
                />
                {isLoadingGrid && (
                  <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-zinc-950/60 rounded-b-xl pointer-events-none">
                    <div className="flex items-center gap-2 bg-zinc-900/90 border border-white/10 rounded-lg px-4 py-2 text-sm text-zinc-300">
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                      Carregando grade INOM…
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Carrinho */}
        <div className="w-72 shrink-0 bg-zinc-900 border border-white/10 rounded-xl flex flex-col">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-emerald-400" />
            <span className="font-medium text-sm text-zinc-200">
              Carrinho ({items.length})
            </span>
          </div>

          <div className="flex-1 overflow-auto p-2 space-y-1">
            {items.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center mt-4 px-2">
                Clique nas células do mapa para adicionar produtos ao carrinho
              </p>
            ) : (
              items.map((item) => {
                const key = cartKey(item);
                const imp = impressoes[key];
                return (
                  <div
                    key={key}
                    className="bg-zinc-800 border border-white/5 rounded-lg p-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        {item.mi ? (
                          <>
                            <p className="font-medium text-emerald-400 truncate">
                              MI: {item.mi}
                            </p>
                            <p className="font-mono text-zinc-500 text-[10px] truncate">
                              Ind Nom: {item.inom}
                            </p>
                          </>
                        ) : (
                          <p className="font-mono font-medium text-zinc-200 truncate">
                            Ind Nom: {item.inom}
                          </p>
                        )}
                        <p className="text-zinc-400">
                          {TIPO_PRODUTO_LABELS[item.tipo_produto]}
                        </p>
                        <p className="text-zinc-500">{item.escala}</p>
                      </div>
                      <button
                        onClick={() =>
                          removeItem(item.inom, item.tipo_produto, item.escala)
                        }
                        className="text-zinc-500 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Indicador de impressão por item no carrinho */}
                    {isImpressao && imp && (
                      <div className="mt-1.5 pt-1.5 border-t border-white/5 text-[10px] text-emerald-400">
                        {imp.quantidade}x {imp.tipo}
                      </div>
                    )}
                    {!isImpressao && item.impressao && imp && (
                      <div className="mt-1.5 pt-1.5 border-t border-white/5 text-[10px] text-emerald-400">
                        Impressão: {imp.quantidade}x {imp.tipo}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="p-3 border-t border-white/10">
            <button
              onClick={handleOpenRevisao}
              disabled={items.length === 0}
              className="w-full bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_2px_12px_-2px_rgba(16,185,129,0.4)]"
            >
              <ClipboardCheck className="h-4 w-4" />
              Revisar Pedido
            </button>
          </div>
        </div>
      </div>

      {/* Modal de revisão */}
      {showRevisao && (
        <RevisaoModal
          items={items}
          impressoes={impressoes}
          onRemoveItem={(item) => {
            removeItem(item.inom, item.tipo_produto, item.escala);
            if (items.length === 1) setShowRevisao(false);
          }}
          onSetItemImpressao={setItemImpressao}
          onRemoveItemImpressao={removeItemImpressao}
          onClose={() => setShowRevisao(false)}
          onConfirm={handleSubmit}
          submitting={submitting}
          isImpressao={isImpressao}
          finalidadeGeo={finalidadeGeo}
          finalidade={finalidade}
          onSetFinalidade={setFinalidade}
        />
      )}
    </div>
  );
}
