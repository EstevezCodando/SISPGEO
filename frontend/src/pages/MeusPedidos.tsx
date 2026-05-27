import {
    DndContext,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { FeatureCollection } from "geojson";
import L from "leaflet";
import {
    AlertCircle,
    AlertTriangle,
    Building2,
    CalendarClock,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Download,
    ExternalLink,
    FileText,
    GripVertical,
    Loader2,
    Lock,
    Mail,
    MapPin,
    Pencil,
    Phone,
    Printer,
    Send,
    Trash2,
    User,
    X,
} from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { Link, useNavigate } from "react-router-dom";
import { janelasApi, type MinhaJanela } from "../api/janelas";
import { pedidosApi } from "../api/pedidos";
import { CadeiaAprovacao } from "../components/shared/CadeiaAprovacao";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import { useExportRelatorio } from "../hooks/useExportRelatorio";
import { useAuthStore } from "../store/authStore";
import { cartKey, useCartStore } from "../store/cartStore";
import type { ItemPedido, MaterialImpressao, Pedido } from "../types/pedido";
import { TIPO_PRODUTO_LABELS, getStatusSolicitante } from "../types/pedido";

// ─── Map layer helper ─────────────────────────────────────────────────────────
function GeoJSONLayer({ geojson }: { geojson: FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    const layer = L.geoJSON(geojson, {
      style: () => ({
        color: "#10b981",
        weight: 2,
        fillColor: "#10b981",
        fillOpacity: 0.18,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onEachFeature: (feature: any, lyr: L.Layer) => {
        const p = feature.properties ?? {};
        const inom = p.inom ?? "—";
        const mi = p.mi ?? null;
        let tip = `<b>${inom}</b>`;
        if (mi)
          tip += `<br><span style="color:#a1a1aa">MI:</span> <span style="color:#34d399;font-weight:600">${mi}</span>`;
        if (p.tipo_produto)
          tip += `<br>${TIPO_PRODUTO_LABELS[p.tipo_produto as keyof typeof TIPO_PRODUTO_LABELS] ?? p.tipo_produto}`;
        if (p.escala) tip += `<br>${p.escala}`;
        // BDGEx availability
        if (p.disponivel_bdgex === true) {
          const idadeAnos: number | null = p.idade_anos ?? null;
          const ageStr = idadeAnos != null
            ? (idadeAnos < 1
                ? `${Math.round(idadeAnos * 12)} meses`
                : `${idadeAnos} ano${idadeAnos !== 1 ? "s" : ""}`)
            : null;
          tip += `<br><span style="color:#10b981">BDGEx: Sim${ageStr ? ` &middot; Produto com ${ageStr}` : ""}</span>`;
        } else if (p.disponivel_bdgex === false) {
          tip += `<br><span style="color:#71717a">BDGEx: Não disponível</span>`;
        }
        lyr.bindTooltip(tip, {
          sticky: true,
          className: "leaflet-dark-tooltip",
        });
      },
    }).addTo(map);
    try {
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
    } catch {
      /* ignore */
    }
    return () => {
      layer.remove();
    };
  }, [geojson, map]);
  return null;
}

// ─── Status codes ─────────────────────────────────────────────────────────────
const STATUS_CAN_EDIT: string[] = ["RASCUNHO"];
const STATUS_CAN_CANCEL: string[] = ["RASCUNHO"];

// ─── Sortable Pedido Row ──────────────────────────────────────────────────────
interface SortablePedidoProps {
  pedido: Pedido;
  rank: number;
  isExpanded: boolean;
  janelaFechada: boolean;
  onToggle: (id: number) => void;
  onEdit: (p: Pedido) => void;
  onDelete: (p: Pedido) => void;
  onSpatialize: (p: Pedido) => void;
  onReorderItems: (pedido: Pedido, orderedIds: number[]) => void;
  onDeleteItem: (pedidoId: number, itemId: number) => void;
}

function SortablePedidoRow_Base({
  pedido: p,
  rank,
  isExpanded,
  janelaFechada,
  onToggle,
  onEdit,
  onDelete,
  onSpatialize,
  onReorderItems,
  onDeleteItem,
}: SortablePedidoProps) {
  const { user } = useAuthStore();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: p.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const canEdit = STATUS_CAN_EDIT.includes(p.status) && !janelaFechada;
  const canCancel = STATUS_CAN_CANCEL.includes(p.status) && !janelaFechada;
  const canReorder = canEdit;

  const itemSensors = useSensors(useSensor(PointerSensor));
  const [localItems, setLocalItems] = useState<ItemPedido[]>(
    [...p.itens].sort((a, b) => a.prioridade - b.prioridade),
  );

  useEffect(() => {
    setLocalItems([...p.itens].sort((a, b) => a.prioridade - b.prioridade));
  }, [p.itens]);

  const handleItemDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = localItems.findIndex((i) => i.id === active.id);
    const newIdx = localItems.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(localItems, oldIdx, newIdx);
    setLocalItems(reordered);
    try {
      await onReorderItems(
        p,
        reordered.map((i) => i.id),
      );
    } catch {
      setLocalItems([...p.itens].sort((a, b) => a.prioridade - b.prioridade));
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (localItems.length <= 1) {
      toast.error("Não é possível remover o único produto do pedido");
      return;
    }
    try {
      await onDeleteItem(p.id, itemId);
      setLocalItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch {
      toast.error("Erro ao remover produto");
    }
  };

  const tipos =
    [...new Set(p.itens.map((i) => TIPO_PRODUTO_LABELS[i.tipo_produto]))].join(
      " · ",
    ) || "—";
  const escalas = [...new Set(p.itens.map((i) => i.escala))].join(", ");

  // Descrição: finalidade_geo OU operação nomeada OU início da informação complementar
  const descricao = p.finalidade_geo
    ? p.finalidade_geo
    : p.operacao_nome
      ? p.operacao_nome
      : p.finalidade
        ? p.finalidade.length > 50
          ? p.finalidade.substring(0, 50) + "…"
          : p.finalidade
        : null;

  const statusSimpl = getStatusSolicitante(p.status);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden"
    >
      {/* Auto-submitted notice */}
      {p.auto_submitted && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Este pedido foi enviado automaticamente no fim do prazo de
          solicitações
        </div>
      )}

      {/* ── Summary row ── */}
      <div className="flex items-center gap-1">
        {/* Drag handle + prioridade */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="pl-3 pr-1 py-3.5 flex items-center gap-1.5 text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing touch-none group"
          title="Arrastar para reordenar prioridade"
        >
          <GripVertical className="h-4 w-4" />
          <span className="text-[10px] font-bold text-zinc-600 group-hover:text-zinc-400 w-3">
            {rank}
          </span>
        </button>

        {/* Conteúdo clicável */}
        <button
          type="button"
          className="flex-1 flex items-start gap-3 px-2 py-3.5 hover:bg-white/5 transition-colors text-left min-w-0"
          onClick={() => onToggle(p.id)}
        >
          <span className="text-zinc-500 shrink-0 mt-0.5">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>

          {/* ID + status badge */}
          <div className="shrink-0 flex flex-col items-start gap-1 w-24">
            <span className="font-mono font-semibold text-emerald-400 text-sm">
              #{p.id}
            </span>
            <span
              className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${statusSimpl.cls}`}
            >
              {statusSimpl.label}
            </span>
          </div>

          {/* Descrição do pedido */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-100 font-medium truncate">
              {tipos}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5 truncate">
              {escalas && <span className="text-zinc-400 mr-2">{escalas}</span>}
              {descricao && <span>{descricao}</span>}
              {!descricao && (
                <span className="italic text-zinc-600">
                  {p.itens.length} item(ns)
                </span>
              )}
              {p.impressao_solicitada && (
                <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-violet-400 font-medium">
                  <Printer className="h-3 w-3" />
                  Impressão
                </span>
              )}
            </p>
          </div>
        </button>

        {/* Ações rápidas */}
        <div className="flex items-center gap-1 pr-3">
          {canEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(p);
              }}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              title="Editar pedido"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {canCancel && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(p);
              }}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Remover pedido"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {isExpanded && (
        <div className="border-t border-white/5 bg-zinc-950/30">
          {/* Dados do solicitante */}
          <div className="px-5 pt-4 pb-3 border-b border-white/5">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">
              Dados do solicitante
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-zinc-300">
                <User className="h-3 w-3 text-zinc-500 shrink-0" />
                <span className="truncate">
                  {p.usuario_nome ?? user?.nome ?? "—"}
                </span>
              </div>
              {user?.om && (
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <Building2 className="h-3 w-3 text-zinc-500 shrink-0" />
                  <span className="truncate">{user.om}</span>
                </div>
              )}
              {user?.telefone && (
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <Phone className="h-3 w-3 text-zinc-500 shrink-0" />
                  <span>{user.telefone}</span>
                </div>
              )}
              {user?.email && (
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <Mail className="h-3 w-3 text-zinc-500 shrink-0" />
                  <span className="truncate">{user.email}</span>
                </div>
              )}
            </div>
          </div>

          {/* Detalhes do pedido */}
          <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-xs border-b border-white/5">
            <div>
              <p className="text-zinc-500 mb-0.5">Status</p>
              <span
                className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusSimpl.cls}`}
              >
                {statusSimpl.label}
              </span>
            </div>
            <div>
              <p className="text-zinc-500 mb-0.5">Criado em</p>
              <p className="text-zinc-300">
                {format(new Date(p.criado_em), "dd/MM/yyyy 'às' HH:mm", {
                  locale: ptBR,
                })}
              </p>
            </div>
            <div>
              <p className="text-zinc-500 mb-0.5">Data sugerida de entrega</p>
              <p className="text-zinc-300">
                {format(new Date(p.data_entrega + "T00:00:00"), "dd/MM/yyyy", {
                  locale: ptBR,
                })}
              </p>
            </div>
            {p.finalidade_geo && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-zinc-500 mb-0.5">
                  Finalidade da Geoinformação
                </p>
                <p className="text-zinc-300">{p.finalidade_geo}</p>
              </div>
            )}
            {p.finalidade && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-zinc-500 mb-0.5">Informação Complementar</p>
                <p className="text-zinc-300">{p.finalidade}</p>
              </div>
            )}
            {p.motivo_reprovacao && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-zinc-500 mb-0.5">Motivo</p>
                <p className="text-orange-400">{p.motivo_reprovacao}</p>
              </div>
            )}
            {p.observacoes && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-zinc-500 mb-0.5">Observações do gestor</p>
                <p className="text-zinc-300 leading-relaxed">{p.observacoes}</p>
              </div>
            )}
            {p.impressao_solicitada && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-zinc-500 mb-1">Impressão</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-xs bg-violet-500/10 border border-violet-500/20 text-violet-300 px-2.5 py-1 rounded-lg">
                    <Printer className="h-3 w-3" />
                    Impressão solicitada
                  </span>
                  {p.impressao_quantidade && (
                    <span className="text-xs text-zinc-400">
                      {p.impressao_quantidade} cópia
                      {p.impressao_quantidade !== 1 ? "s" : ""}
                    </span>
                  )}
                  {p.impressao_tipo_material && (
                    <span className="text-xs text-zinc-400">
                      · {p.impressao_tipo_material}
                    </span>
                  )}
                </div>
              </div>
            )}
            {p.link_bdgex && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-zinc-500 mb-0.5">
                  Dados disponíveis no BDGEx
                </p>
                <a
                  href={p.link_bdgex}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 text-xs font-medium transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Acessar dados no BDGEx
                </a>
              </div>
            )}
            {p.cadeia_aprovacao && p.cadeia_aprovacao.length > 0 && (
              <div className="col-span-2 sm:col-span-3">
                <CadeiaAprovacao
                  cadeia={p.cadeia_aprovacao}
                  status={p.status}
                />
              </div>
            )}
          </div>

          {/* Produtos */}
          <div className="px-5 py-4">
            <div className="mb-2">
              <p className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Produtos do pedido ({localItems.length})
              </p>
              {canReorder && (
                <p className="text-[11px] text-emerald-500 font-semibold mt-1.5 flex items-center gap-1">
                  <GripVertical className="h-3 w-3" />
                  Arraste para reordenar prioridade
                </p>
              )}
            </div>

            {canReorder ? (
              <DndContext
                sensors={itemSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleItemDragEnd}
              >
                <SortableContext
                  items={localItems.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1">
                    {localItems.map((item, idx) => (
                      <SortableItemRow
                        key={item.id}
                        item={item}
                        rank={idx + 1}
                        canDelete={localItems.length > 1}
                        onDelete={() => handleDeleteItem(item.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="space-y-1">
                {localItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2.5 text-xs bg-zinc-800/60 border border-zinc-700/40 rounded-lg px-3 py-2"
                  >
                    {item.mi && (
                      <span className="text-zinc-500 shrink-0">
                        MI:{" "}
                        <span className="text-zinc-300 font-mono">
                          {item.mi}
                        </span>
                      </span>
                    )}
                    <span className="text-zinc-500 shrink-0">
                      INOM:{" "}
                      <span className="text-emerald-400 font-mono font-medium">
                        {item.inom}
                      </span>
                    </span>
                    <span className="text-zinc-400 shrink-0">
                      {TIPO_PRODUTO_LABELS[item.tipo_produto]}
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-500 shrink-0">
                      {item.escala}
                    </span>
                    {item.impressao_quantidade &&
                    item.impressao_tipo_material ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <Printer className="h-3 w-3 text-violet-400" />
                        <span className="text-zinc-400">
                          {item.impressao_quantidade}×{" "}
                          {item.impressao_tipo_material}
                        </span>
                      </div>
                    ) : (
                      <span className="text-zinc-700 shrink-0 text-[11px]">
                        Sem Impressão
                      </span>
                    )}
                    {item.disponivel_bdgex && (
                      <span className="ml-auto text-emerald-500 font-medium shrink-0">
                        Disponível no BDGEx
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="px-5 py-3 border-t border-white/5 flex flex-wrap items-center gap-2">
            <button
              onClick={() => onSpatialize(p)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
            >
              <MapPin className="h-3.5 w-3.5" />
              Ver no mapa
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// React.memo evita re-render de todos os pedidos quando apenas um expande.
// Os callbacks estáveis (useCallback no parent) garantem que o memo funcione.
const SortablePedidoRow = memo(
  SortablePedidoRow_Base,
  (prev, next) =>
    prev.pedido === next.pedido &&
    prev.isExpanded === next.isExpanded &&
    prev.rank === next.rank &&
    prev.janelaFechada === next.janelaFechada &&
    prev.onToggle === next.onToggle &&
    prev.onEdit === next.onEdit &&
    prev.onDelete === next.onDelete &&
    prev.onSpatialize === next.onSpatialize &&
    prev.onReorderItems === next.onReorderItems &&
    prev.onDeleteItem === next.onDeleteItem,
);

// ─── Sortable Item Row ────────────────────────────────────────────────────────
function SortableItemRow({
  item,
  rank,
  canDelete,
  onDelete,
}: {
  item: ItemPedido;
  rank: number;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2.5 text-xs bg-zinc-800/60 border border-zinc-700/40 rounded-lg px-2 py-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing touch-none shrink-0"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="text-zinc-600 w-4 text-center shrink-0">{rank}</span>
      {item.mi && (
        <span className="text-zinc-500 shrink-0">
          MI: <span className="text-zinc-300 font-mono">{item.mi}</span>
        </span>
      )}
      <span className="text-zinc-500 shrink-0">
        INOM:{" "}
        <span className="text-emerald-400 font-mono font-medium">
          {item.inom}
        </span>
      </span>
      <span className="text-zinc-400 shrink-0">
        {TIPO_PRODUTO_LABELS[item.tipo_produto]}
      </span>
      <span className="text-zinc-600">·</span>
      <span className="text-zinc-500 shrink-0">{item.escala}</span>
      {item.impressao_quantidade && item.impressao_tipo_material ? (
        <div className="flex items-center gap-1 shrink-0">
          <Printer className="h-3 w-3 text-violet-400" />
          <span className="text-zinc-400">
            {item.impressao_quantidade}× {item.impressao_tipo_material}
          </span>
        </div>
      ) : (
        <span className="text-zinc-700 shrink-0 text-[11px]">
          Sem Impressão
        </span>
      )}
      {item.disponivel_bdgex && (
        <span className="text-emerald-500 font-medium shrink-0">
          Disponível no BDGEx
        </span>
      )}
      <button
        onClick={onDelete}
        disabled={!canDelete}
        className="ml-auto text-zinc-600 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
        title={
          canDelete
            ? "Remover produto"
            : "Não é possível remover o único produto"
        }
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Enviar Pedidos Modal ─────────────────────────────────────────────────────
interface EnviarPedidosModalProps {
  rascunhos: Pedido[];
  onClose: () => void;
  onEnviado: (atualizados: Pedido[]) => void;
}
function EnviarPedidosModal({
  rascunhos,
  onClose,
  onEnviado,
}: EnviarPedidosModalProps) {
  const { user } = useAuthStore();
  const [step, setStep] = useState<"select" | "contato">("select");
  const [sending, setSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(rascunhos.map((p) => p.id)),
  );
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === rascunhos.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(rascunhos.map((p) => p.id)));
  };

  const handleEnviar = async () => {
    setSending(true);
    try {
      const ids = [...selectedIds];
      const res = await pedidosApi.enviarLote(false, ids);
      toast.success(
        `${res.data.length} pedido${res.data.length !== 1 ? "s" : ""} enviado${res.data.length !== 1 ? "s" : ""} com sucesso!`,
      );
      onEnviado(res.data);
      onClose();
    } catch {
      toast.error("Erro ao enviar pedidos");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
            <Send className="h-4 w-4 text-emerald-400" />
            {step === "select" ? "Selecionar Pedidos para Envio" : "Confirmar Envio"}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === "select" ? (
          <>
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-3">
              {/* Warning */}
              <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300/80 leading-relaxed">
                  Após o envio não será possível realizar alterações. Selecione os pedidos que deseja encaminhar agora.
                </p>
              </div>

              {/* Select-all toggle */}
              <div className="flex items-center justify-between text-xs px-0.5">
                <span className="text-zinc-500">
                  {selectedIds.size} de {rascunhos.length} selecionado{selectedIds.size !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={toggleAll}
                  className="text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
                >
                  {selectedIds.size === rascunhos.length ? "Desmarcar todos" : "Selecionar todos"}
                </button>
              </div>

              {/* Pedido rows */}
              <div className="space-y-1.5">
                {rascunhos.map((p, i) => {
                  const tipos = [
                    ...new Set(p.itens.map((it) => TIPO_PRODUTO_LABELS[it.tipo_produto])),
                  ].join(", ");
                  const isSelected = selectedIds.has(p.id);
                  const isExpanded = expandedIds.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`rounded-lg border transition-colors ${
                        isSelected
                          ? "border-emerald-500/30 bg-zinc-800/60"
                          : "border-zinc-700/40 bg-zinc-800/30"
                      }`}
                    >
                      {/* Row header */}
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 cursor-pointer accent-emerald-500 shrink-0"
                        />
                        <span className="text-zinc-500 text-xs w-5 shrink-0">{i + 1}º</span>
                        <span className="font-mono text-emerald-400 text-xs shrink-0">#{p.id}</span>
                        <span className="text-zinc-300 text-xs flex-1 truncate">{tipos}</span>
                        <span className="text-zinc-600 text-xs shrink-0">{p.itens.length} prod.</span>
                        <button
                          onClick={() => toggleExpand(p.id)}
                          title={isExpanded ? "Recolher" : "Ver itens"}
                          className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                        >
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      </div>

                      {/* Expanded items */}
                      {isExpanded && (
                        <div className="px-3 pb-2.5 space-y-1 border-t border-white/5">
                          {p.itens.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 text-xs text-zinc-400 pl-7 py-0.5"
                            >
                              <span className="text-emerald-400/80 font-mono">{item.inom}</span>
                              {item.mi && (
                                <span className="text-zinc-600">MI {item.mi}</span>
                              )}
                              <span className="text-zinc-600">·</span>
                              <span>{TIPO_PRODUTO_LABELS[item.tipo_produto]}</span>
                              <span className="text-zinc-600">·</span>
                              <span>{item.escala}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-5 py-4 border-t border-white/10 shrink-0">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => setStep("contato")}
                disabled={selectedIds.size === 0}
                className="flex-1 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 disabled:opacity-40 transition-colors"
              >
                Continuar ({selectedIds.size})
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-5 space-y-4">
              <p className="text-xs text-zinc-400">
                Confirme seus dados de contato antes de enviar. Eles serão visíveis ao supervisor.
              </p>
              <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2.5 text-sm">
                  <User className="h-4 w-4 text-zinc-500 shrink-0" />
                  <span className="text-zinc-200 font-medium">{user?.nome ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm">
                  <Building2 className="h-4 w-4 text-zinc-500 shrink-0" />
                  <span className="text-zinc-300">{user?.om ?? "—"}</span>
                </div>
                {user?.telefone && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <Phone className="h-4 w-4 text-zinc-500 shrink-0" />
                    <span className="text-zinc-300">{user.telefone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2.5 text-sm">
                  <Mail className="h-4 w-4 text-zinc-500 shrink-0" />
                  <span className="text-zinc-300">{user?.email ?? "—"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <p className="text-xs text-emerald-300/80">
                  {selectedIds.size} pedido{selectedIds.size !== 1 ? "s" : ""} selecionado{selectedIds.size !== 1 ? "s" : ""} para envio
                </p>
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-white/10">
              <button
                onClick={() => setStep("select")}
                className="flex-1 py-2.5 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleEnviar}
                disabled={sending}
                className="flex-1 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
const FINALIDADES_GEO = [
  "Operação Militar",
  "Exercício Combinado",
  "Exercício Integrador",
  "Manobra Escolar",
  "Instrução Militar",
  "Atualização de Campo de Instrução",
  "Atualização",
] as const;

interface EditModalProps {
  pedido: Pedido;
  onClose: () => void;
  onSaved: (updated: Pedido) => void;
}
function EditModal({ pedido, onClose, onSaved }: EditModalProps) {
  const navigate = useNavigate();
  const [dataEntrega, setDataEntrega] = useState(pedido.data_entrega);
  const [finalidadeGeo, setFinalidadeGeo] = useState(
    pedido.finalidade_geo ?? "",
  );
  const [finalidade, setFinalidade] = useState(pedido.finalidade ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await pedidosApi.update(pedido.id, {
        data_entrega: dataEntrega,
        finalidade_geo: finalidadeGeo || null,
        finalidade: finalidade || null,
      });
      toast.success("Pedido atualizado");
      onSaved(res.data);
      onClose();
    } catch {
      toast.error("Erro ao salvar pedido");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-base font-semibold text-zinc-100">
            Editar Pedido #{pedido.id}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Data de entrega */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Data sugerida de entrega
            </label>
            <input
              type="date"
              value={dataEntrega}
              onChange={(e) => setDataEntrega(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Finalidade da Geoinformação */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Finalidade da Geoinformação
            </label>
            <select
              value={finalidadeGeo}
              onChange={(e) => setFinalidadeGeo(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Selecione…</option>
              {FINALIDADES_GEO.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          {/* Informação Complementar */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Informação Complementar{" "}
              <span className="text-zinc-600">(opcional)</span>
            </label>
            <textarea
              value={finalidade}
              onChange={(e) => setFinalidade(e.target.value)}
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none placeholder:text-zinc-600"
              placeholder="Informações adicionais sobre o pedido…"
            />
          </div>

          {/* Gerenciar produtos */}
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-300">
                Adicionar ou remover produtos
              </p>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                Para alterar os produtos (MI/INOM) vá à tela de solicitação.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate("/solicitar-produtos");
              }}
              className="shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ir para pedido
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-6 pt-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 disabled:opacity-50 transition-colors"
          >
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────
interface DeleteModalProps {
  pedido: Pedido;
  onClose: () => void;
  onDeleted: (id: number) => void;
}
function DeleteModal({ pedido, onClose, onDeleted }: DeleteModalProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await pedidosApi.cancel(pedido.id);
      toast.success(`Pedido #${pedido.id} removido`);
      onDeleted(pedido.id);
      onClose();
    } catch {
      toast.error("Erro ao remover pedido");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-base font-semibold text-zinc-100">
            Remover Pedido #{pedido.id}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-zinc-400">
            Tem certeza que deseja remover este rascunho? Esta ação não poderá
            ser desfeita.
          </p>
        </div>
        <div className="flex gap-2 p-6 pt-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-colors"
          >
            Voltar
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 px-4 py-2 rounded-lg bg-red-500/80 text-white text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition-colors"
          >
            {deleting ? "Removendo…" : "Remover"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Spatialize Modal ─────────────────────────────────────────────────────────
interface SpatializeModalProps {
  pedido: Pedido;
  onClose: () => void;
}
function SpatializeModal({ pedido, onClose }: SpatializeModalProps) {
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pedidosApi
      .features(pedido.id)
      .then((res) => setGeojson(res.data as FeatureCollection))
      .catch(() => toast.error("Erro ao carregar geometrias"))
      .finally(() => setLoading(false));
  }, [pedido.id]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* max-h + flex col garante que header/footer ficam visíveis mesmo com muitos itens */}
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header — fixo */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Pedido #{pedido.id} — Ver no mapa
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {pedido.itens.length} produto
              {pedido.itens.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — área que cresce e rola */}
        <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-4">
          {loading ? (
            <div className="h-72 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
            </div>
          ) : geojson ? (
            <div className="h-72 rounded-xl overflow-hidden border border-white/10">
              <MapContainer
                center={[-15, -52]}
                zoom={5}
                style={{ height: "100%", width: "100%", background: "#18181b" }}
                zoomControl
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                />
                <GeoJSONLayer geojson={geojson} />
              </MapContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-zinc-500 text-sm">
              Nenhuma geometria disponível para este pedido
            </div>
          )}
          {/* Chips de itens — podem ser muitos, ficam dentro da área rolável */}
          <div className="flex flex-wrap gap-1.5">
            {pedido.itens.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs"
              >
                <span className="text-emerald-400 font-mono">{item.inom}</span>
                {item.mi && (
                  <>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-500">MI {item.mi}</span>
                  </>
                )}
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">
                  {TIPO_PRODUTO_LABELS[item.tipo_produto]}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Footer — fixo, sempre visível */}
        <div className="p-5 border-t border-white/10 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
type ModalType = "edit" | "delete" | "spatialize" | "enviar";

export function MeusPedidos() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{
    type: ModalType;
    pedido?: Pedido;
  } | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [minhaJanela, setMinhaJanela] = useState<MinhaJanela | null>(null);
  const autoSubmitDoneRef = useRef(false);
  const { exportando, baixarRelatorio } = useExportRelatorio();

  const sensors = useSensors(useSensor(PointerSensor));

  const load = useCallback(() => {
    setLoading(true);
    pedidosApi
      .list()
      .then((res) => {
        const sorted = [...res.data].sort(
          (a, b) => a.prioridade - b.prioridade,
        );
        setPedidos(sorted);
      })
      .catch(() => toast.error("Erro ao carregar pedidos"))
      .finally(() => setLoading(false));
  }, []);

  // Carrega status da janela do usuário logado
  useEffect(() => {
    janelasApi
      .minhaJanela()
      .then((r) => setMinhaJanela(r.data))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  const now = new Date();
  const janelaAtiva = minhaJanela?.aberta ?? false;
  const dataFimJanela = minhaJanela?.data_fim
    ? new Date(minhaJanela.data_fim)
    : null;
  const dataInicioJanela = minhaJanela?.data_inicio
    ? new Date(minhaJanela.data_inicio)
    : null;
  const janelaFechada = minhaJanela?.configurada
    ? !janelaAtiva && dataFimJanela
      ? isAfter(now, dataFimJanela)
      : false
    : false;

  // Auto-submit quando janela fechou e há pedidos RASCUNHO ainda não enviados
  useEffect(() => {
    if (!janelaFechada || autoSubmitDoneRef.current || loading) return;
    const temRascunho = pedidos.some((p) => p.status === "RASCUNHO");
    if (!temRascunho) return;
    autoSubmitDoneRef.current = true;
    pedidosApi
      .enviarLote(true)
      .then((res) => {
        if (res.data.length > 0) {
          setPedidos((prev) => {
            const map = new globalThis.Map(res.data.map((p) => [p.id, p]));
            return prev.map((p) => (map.has(p.id) ? map.get(p.id)! : p));
          });
          toast("Pedidos enviados automaticamente ao fim do prazo", {
            icon: "⏰",
          });
        }
      })
      .catch(() => {});
  }, [janelaFechada, loading, pedidos]);

  // Callbacks estáveis — necessários para React.memo funcionar corretamente
  const handleToggle = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleOpenEdit = useCallback(
    (p: Pedido) => {
      const cart = useCartStore.getState();
      cart.clear();

      // Pré-preenche campos do pedido
      cart.setDataEntrega(p.data_entrega);
      cart.setFinalidadeGeo(p.finalidade_geo ?? "");
      cart.setFinalidade(p.finalidade ?? "");
      cart.setEditingPedidoId(p.id);

      // Adiciona todos os itens ao carrinho (ordem de prioridade)
      const itensSorted = [...p.itens].sort(
        (a, b) => a.prioridade - b.prioridade,
      );
      for (const item of itensSorted) {
        cart.addItem({
          inom: item.inom,
          mi: item.mi,
          tipo_produto: item.tipo_produto,
          escala: item.escala,
          solicitar_mesmo_disponivel: item.solicitar_mesmo_disponivel,
          disponivel_bdgex: item.disponivel_bdgex,
          data_producao_bdgex: item.data_producao_bdgex ?? null,
        });
        if (item.impressao_quantidade && item.impressao_tipo_material) {
          const key = cartKey({
            inom: item.inom,
            tipo_produto: item.tipo_produto,
            escala: item.escala,
          });
          cart.setItemImpressao(
            key,
            item.impressao_quantidade,
            item.impressao_tipo_material as MaterialImpressao,
          );
        }
      }

      // Define tipo e escala do primeiro item para carregar o grid correto no mapa
      if (itensSorted.length > 0) {
        cart.setTipoProduto(itensSorted[0].tipo_produto);
        cart.setEscala(itensSorted[0].escala);
      }

      navigate("/solicitar-produtos");
    },
    [navigate],
  );
  const handleOpenDelete = useCallback(
    (p: Pedido) => setModal({ type: "delete", pedido: p }),
    [],
  );
  const handleOpenSpatialize = useCallback(
    (p: Pedido) => setModal({ type: "spatialize", pedido: p }),
    [],
  );

  const handleUpdated = (updated: Pedido) => {
    setPedidos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleDeleted = (id: number) => {
    setPedidos((prev) => prev.filter((p) => p.id !== id));
  };

  const handlePedidoDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = pedidos.findIndex((p) => p.id === active.id);
      const newIdx = pedidos.findIndex((p) => p.id === over.id);
      const reordered = arrayMove(pedidos, oldIdx, newIdx);
      setPedidos(reordered);
      try {
        await pedidosApi.reorderPedidos(reordered.map((p) => p.id));
      } catch {
        toast.error("Erro ao salvar ordem dos pedidos");
        load();
      }
    },
    [pedidos, load],
  );

  const handleReorderItems = useCallback(
    async (pedido: Pedido, orderedIds: number[]) => {
      await pedidosApi.reorderItems(pedido.id, orderedIds);
    },
    [],
  );

  const handleDeleteItem = useCallback(
    async (pedidoId: number, itemId: number) => {
      await pedidosApi.deleteItem(pedidoId, itemId);
      setPedidos((prev) =>
        prev.map((p) =>
          p.id === pedidoId
            ? { ...p, itens: p.itens.filter((i) => i.id !== itemId) }
            : p,
        ),
      );
    },
    [],
  );

  if (loading) return <LoadingSpinner />;

  const rascunhos = pedidos.filter((p) => p.status === "RASCUNHO");
  const todosEnviados = pedidos.length > 0 && rascunhos.length === 0;
  const canReorderPedidos = rascunhos.length > 0 && !janelaFechada;
  const dataFim = dataFimJanela;
  const diasRestantes = minhaJanela?.dias_restantes ?? 0;
  const urgente = janelaAtiva && diasRestantes <= 7;
  // Botão "Enviar": durante janela aberta OU fallback pós-fechamento
  const showEnviarBtn = rascunhos.length > 0 && (janelaAtiva || janelaFechada);

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
            Meus Pedidos
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Botão Enviar Pedidos — durante janela aberta (envio manual antecipado) ou pós-fechamento (fallback) */}
          {showEnviarBtn && (
            <button
              onClick={() => setModal({ type: "enviar" })}
              className="inline-flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
            >
              <Send className="h-4 w-4" />
              Enviar Pedidos ({rascunhos.length})
            </button>
          )}
          {/* Exportar relatório — disponível sempre que houver pedidos */}
          {pedidos.length > 0 && (
            <button
              onClick={baixarRelatorio}
              disabled={exportando}
              className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Baixar pedidos em ZIP (CSV + GeoJSON por escala + LEIA-ME)"
            >
              {exportando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </button>
          )}
          {janelaAtiva ? (
            <Link
              to="/solicitar-produtos"
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
            >
              + Novo Pedido
            </Link>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-500">
              <Lock className="h-3.5 w-3.5" />
              Período encerrado
            </div>
          )}
        </div>
      </div>

      {/* ── Banner janela de solicitações ── */}
      {minhaJanela &&
        (() => {
          // Acesso irrestrito (DSG/CGEO) — sem restrição de janela, oculta banner
          if (janelaAtiva && !dataFimJanela && minhaJanela.configurada)
            return null;

          const semJanela = !minhaJanela.configurada;
          const corDias =
            diasRestantes <= 7
              ? "text-red-400"
              : diasRestantes <= 30
                ? "text-amber-400"
                : "text-emerald-400";
          const corBarra =
            diasRestantes <= 7
              ? "bg-red-500"
              : diasRestantes <= 30
                ? "bg-amber-500"
                : "bg-emerald-500";

          return (
            <div
              className={`rounded-2xl border mb-6 overflow-hidden ${
                janelaFechada
                  ? "bg-zinc-800/50 border-zinc-700"
                  : semJanela
                    ? "bg-zinc-800/40 border-zinc-700/60"
                    : urgente
                      ? "bg-red-500/10 border-red-500/30"
                      : janelaAtiva
                        ? "bg-emerald-500/[0.06] border-emerald-500/20"
                        : "bg-blue-500/[0.06] border-blue-500/20"
              }`}
            >
              <div className="p-5 space-y-4">
                {/* ── Linha 1: status chip + contagem regressiva ── */}
                <div className="flex items-center gap-3 flex-wrap">
                  {janelaFechada ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-700/60 text-zinc-400 border border-zinc-600">
                      <Lock className="h-3 w-3" /> Período encerrado
                    </span>
                  ) : semJanela ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-700/60 text-zinc-500 border border-zinc-600">
                      <AlertCircle className="h-3 w-3" /> Não configurada
                    </span>
                  ) : janelaAtiva ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 className="h-3 w-3" /> Janela aberta
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                      <CalendarClock className="h-3 w-3" /> Aguardando abertura
                    </span>
                  )}

                  {/* Contagem regressiva — só quando aberta e com data */}
                  {janelaAtiva && dataFim && (
                    <span className={`ml-auto text-sm font-bold ${corDias}`}>
                      {diasRestantes <= 0
                        ? "Encerra hoje!"
                        : `${diasRestantes} dia${diasRestantes !== 1 ? "s" : ""} restante${diasRestantes !== 1 ? "s" : ""}`}
                    </span>
                  )}
                </div>

                {/* ── Linha 2: data principal ── */}
                <div>
                  <p
                    className={`text-base font-bold leading-snug ${
                      janelaFechada
                        ? "text-zinc-400"
                        : semJanela
                          ? "text-zinc-500"
                          : urgente
                            ? "text-red-200"
                            : janelaAtiva
                              ? "text-zinc-100"
                              : "text-blue-200"
                    }`}
                  >
                    {janelaFechada
                      ? `Encerrado em ${dataFim ? format(dataFim, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "—"}`
                      : semJanela
                        ? "Nenhuma janela configurada para este período"
                        : janelaAtiva && dataFim
                          ? `Prazo final: ${format(dataFim, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`
                          : dataInicioJanela
                            ? `Abre em ${format(dataInicioJanela, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`
                            : "Janela de solicitações"}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    {janelaFechada
                      ? "Novos pedidos, edições e cancelamentos estão bloqueados. Os pedidos já enviados continuam em análise."
                      : semJanela
                        ? "Nenhum período de solicitações foi definido para o seu perfil. Aguarde a abertura do próximo período ou entre em contato com a DSG."
                        : janelaAtiva
                          ? "A janela de solicitações é o período durante o qual sua OM pode encaminhar pedidos de Geoinformação. Novos pedidos não podem ser criados ou enviados fora desta janela."
                          : "O próximo período de solicitações ainda não foi aberto. Assim que a janela for ativada, você poderá criar e enviar pedidos de produtos cartográficos."}
                  </p>
                </div>

                {/* ── Legenda de status — só quando janela aberta ── */}
                {janelaAtiva && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                        <span className="text-xs font-semibold text-zinc-300">
                          Rascunho
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Pedido criado, mas ainda não enviado ao escalão
                        superior. Pode ser editado ou cancelado livremente até o
                        fim do período.
                      </p>
                    </div>
                    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                        <span className="text-xs font-semibold text-zinc-300">
                          Enviado
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Pedido submetido para análise da cadeia de comando. Não
                        pode ser alterado após o envio. Acompanhe o status nesta
                        tela.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Avisos de estado atual ── */}

                {/* Janela aberta + rascunhos pendentes */}
                {janelaAtiva && rascunhos.length > 0 && (
                  <div
                    className={`flex items-start gap-2.5 rounded-xl p-3 ${
                      urgente
                        ? "bg-red-500/10 border border-red-500/20"
                        : "bg-amber-500/8 border border-amber-500/20"
                    }`}
                  >
                    <AlertTriangle
                      className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${urgente ? "text-red-400" : "text-amber-400"}`}
                    />
                    <p
                      className={`text-xs leading-relaxed ${urgente ? "text-red-300" : "text-amber-200/80"}`}
                    >
                      Você tem{" "}
                      <strong
                        className={urgente ? "text-red-200" : "text-amber-200"}
                      >
                        {rascunhos.length} pedido
                        {rascunhos.length !== 1 ? "s" : ""} em rascunho
                      </strong>
                      {urgente
                        ? " — o prazo está se encerrando. Revise e envie seus pedidos o quanto antes, ou serão enviados automaticamente ao fim do período."
                        : ". Pedidos em rascunho serão enviados automaticamente ao encerrar o prazo. Você pode editá-los livremente até lá."}
                    </p>
                  </div>
                )}

                {/* Janela aberta + todos já enviados */}
                {janelaAtiva && todosEnviados && (
                  <div className="flex items-start gap-2.5 bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-3">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-emerald-300 mb-0.5">
                        Todos os pedidos foram enviados
                      </p>
                      <p className="text-[11px] text-emerald-300/70 leading-relaxed">
                        Caso necessite alterar algum pedido, entre em contato
                        com a{" "}
                        <strong>SSGeoInt do seu Cmd Mil A enquadrante</strong>{" "}
                        ou o <strong>Órgão</strong> ao qual está subordinado.
                      </p>
                    </div>
                  </div>
                )}

                {/* Janela fechada + rascunhos ainda pendentes */}
                {janelaFechada && rascunhos.length > 0 && (
                  <p className="text-xs text-zinc-500">
                    Você ainda tem{" "}
                    <strong className="text-zinc-300">
                      {rascunhos.length} pedido
                      {rascunhos.length !== 1 ? "s" : ""} em rascunho
                    </strong>{" "}
                    — use o botão{" "}
                    <strong className="text-emerald-400">Enviar Pedidos</strong>{" "}
                    acima para encaminhá-lo{rascunhos.length !== 1 ? "s" : ""}.
                  </p>
                )}
              </div>

              {/* Barra de progresso temporal */}
              {janelaAtiva &&
                dataFim &&
                dataInicioJanela &&
                (() => {
                  const total = dataFim.getTime() - dataInicioJanela.getTime();
                  const elapsed = now.getTime() - dataInicioJanela.getTime();
                  const pct = Math.min(
                    100,
                    Math.max(0, (elapsed / total) * 100),
                  );
                  return (
                    <div className="h-1 bg-black/20">
                      <div
                        className={`h-full transition-all ${corBarra}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  );
                })()}
            </div>
          );
        })()}

      {/* ── Dica de reordenação + cabeçalho das colunas ── */}
      {canReorderPedidos && pedidos.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-emerald-500 font-semibold flex items-center gap-1.5 mb-2">
            <GripVertical className="h-3.5 w-3.5" />
            Arraste o pedido para reordenar sua prioridade
          </p>
          <div className="flex items-center gap-3 px-3 pb-1.5 border-b border-zinc-800 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">
            <span className="w-[42px] shrink-0">Prioridade</span>
            <span className="w-24 shrink-0 pl-5">ID</span>
            <span className="flex-1 pl-1">Especificações</span>
          </div>
        </div>
      )}

      {/* ── Lista de pedidos ── */}
      {pedidos.length === 0 ? (
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-12 text-center text-zinc-500">
          <p className="text-lg">Nenhum pedido encontrado.</p>
          {!janelaFechada && (
            <Link
              to="/solicitar-produtos"
              className="text-emerald-400 text-sm mt-2 inline-block hover:text-emerald-300 transition-colors"
            >
              Criar primeira solicitação
            </Link>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handlePedidoDragEnd}
        >
          <SortableContext
            items={pedidos.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {pedidos.map((p, idx) => (
                <SortablePedidoRow
                  key={p.id}
                  pedido={p}
                  rank={idx + 1}
                  isExpanded={expanded.has(p.id)}
                  janelaFechada={janelaFechada}
                  onToggle={handleToggle}
                  onEdit={handleOpenEdit}
                  onDelete={handleOpenDelete}
                  onSpatialize={handleOpenSpatialize}
                  onReorderItems={handleReorderItems}
                  onDeleteItem={handleDeleteItem}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* ── Modals ── */}
      {modal?.type === "enviar" && (
        <EnviarPedidosModal
          rascunhos={rascunhos}
          onClose={() => setModal(null)}
          onEnviado={(atualizados) => {
            setPedidos((prev) => {
              const m = new globalThis.Map(atualizados.map((p) => [p.id, p]));
              return prev.map((p) => (m.has(p.id) ? m.get(p.id)! : p));
            });
          }}
        />
      )}
      {modal?.type === "edit" && modal.pedido && (
        <EditModal
          pedido={modal.pedido}
          onClose={() => setModal(null)}
          onSaved={handleUpdated}
        />
      )}
      {modal?.type === "delete" && modal.pedido && (
        <DeleteModal
          pedido={modal.pedido}
          onClose={() => setModal(null)}
          onDeleted={handleDeleted}
        />
      )}
      {modal?.type === "spatialize" && modal.pedido && (
        <SpatializeModal pedido={modal.pedido} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
