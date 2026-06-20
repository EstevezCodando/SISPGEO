import type { FeatureCollection } from "geojson";
import {
    Building2,
    Check,
    ClipboardCheck,
    Loader2,
    Phone,
    ShoppingCart,
    Trash2,
    User,
    X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import api from "../../api/client";
import { RevisaoGeoJSONLayer } from "../map/RevisaoGeoJSONLayer";
import { formatNomeComPosto } from "../../data/postos";
import { useAuthStore } from "../../store/authStore";
import { cartKey } from "../../store/cartStore";
import type { CartItem, ItemImpressao, MaterialImpressao } from "../../types/pedido";
import {
    MATERIAIS_IMPRESSAO,
    TIPO_PRODUTO_LABELS,
    TIPOS_IMPRESSAO,
} from "../../types/pedido";

export interface RevisaoModalProps {
  items: CartItem[];
  impressoes: Record<string, ItemImpressao>;
  onRemoveItem: (item: CartItem) => void;
  onSetItemImpressao: (
    key: string,
    qty: number,
    tipo: MaterialImpressao,
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

export function RevisaoModal({
  items,
  impressoes,
  onRemoveItem,
  onSetItemImpressao,
  onRemoveItemImpressao,
  onClose,
  onConfirm,
  submitting,
  isImpressao: _isImpressao,
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
                                    .value as MaterialImpressao;
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
                                        .value as MaterialImpressao;
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
