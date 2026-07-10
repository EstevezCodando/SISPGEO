export type StatusPedido =
  | "RASCUNHO"
  | "AGUARDANDO_SUPERVISOR"
  | "AGUARDANDO_CONSOLIDADOR"
  | "AGUARDANDO_CARTOGRAFICO"
  | "ATRIBUIDO_CGEO"
  | "APROVADO"
  | "REPROVADO"
  | "CANCELADO"
  | "PRODUZIDO";

export type TipoProduto =
  | "CARTA_TOPOGRAFICA"
  | "CARTA_ORTOIMAGEM"
  | "ORTOIMAGEM"
  | "MDT"
  | "MDS"
  | "CDGV"
  | "IMPRESSAO_CT"
  | "IMPRESSAO_COI"
  | "IMPRESSAO"; // legado

export type Escala = "1:25.000" | "1:50.000" | "1:100.000" | "1:250.000";

export const TIPO_PRODUTO_LABELS: Record<TipoProduto, string> = {
  CARTA_TOPOGRAFICA: "Carta Topográfica",
  CARTA_ORTOIMAGEM: "Carta Ortoimagem",
  ORTOIMAGEM: "Ortoimagem",
  MDT: "Modelo Digital do Terreno (MDT)",
  MDS: "Modelo Digital de Superfície (MDS)",
  CDGV: "Cj de Dados Geoespaciais Vetoriais (CDGV)",
  IMPRESSAO_CT: "Impressão de Carta Topográfica",
  IMPRESSAO_COI: "Impressão de Carta Ortoimagem",
  IMPRESSAO: "Impressão Geoespacial (legado)",
};

export const TIPOS_IMPRESSAO = new Set<TipoProduto>([
  "IMPRESSAO_CT",
  "IMPRESSAO_COI",
  "IMPRESSAO",
]);

export const MATERIAIS_IMPRESSAO = ["Sulfite", "Glossy", "Tyvek"] as const;
export type MaterialImpressao = (typeof MATERIAIS_IMPRESSAO)[number];

// Labels técnicos — usados por gestores/DSG/CGEO que precisam do detalhe interno.
// Cada status tem um rótulo distinto (não usar o mesmo texto em dois status, sob
// pena de gerar opções duplicadas em filtros que iteram STATUS_LABELS).
export const STATUS_LABELS: Record<StatusPedido, string> = {
  RASCUNHO: "Rascunho",
  AGUARDANDO_SUPERVISOR: "Aguardando Supervisor",
  AGUARDANDO_CONSOLIDADOR: "Aguardando Consolidador",
  AGUARDANDO_CARTOGRAFICO: "Aguardando DSG",
  ATRIBUIDO_CGEO: "Em Análise CGEO",
  APROVADO: "Em Atendimento",
  REPROVADO: "Inviável",
  CANCELADO: "Cancelado",
  PRODUZIDO: "Produzido",
};

// Ordem canônica de todos os status — fonte única para dropdowns de filtro.
// Reutilizar em vez de redeclarar arrays de status em cada página.
export const ALL_STATUSES: readonly StatusPedido[] = [
  "RASCUNHO",
  "AGUARDANDO_SUPERVISOR",
  "AGUARDANDO_CONSOLIDADOR",
  "AGUARDANDO_CARTOGRAFICO",
  "ATRIBUIDO_CGEO",
  "APROVADO",
  "PRODUZIDO",
  "REPROVADO",
  "CANCELADO",
];

// Progressão do "caminho feliz" (sem estados terminais negativos) — usada para
// calcular a etapa atual na cadeia de aprovação.
export const STATUS_PROGRESSION: readonly StatusPedido[] = [
  "RASCUNHO",
  "AGUARDANDO_SUPERVISOR",
  "AGUARDANDO_CONSOLIDADOR",
  "AGUARDANDO_CARTOGRAFICO",
  "ATRIBUIDO_CGEO",
  "APROVADO",
  "PRODUZIDO",
];

// Responsável atual por cada status (visão administrativa).
export const STATUS_RESPONSAVEL: Record<StatusPedido, string> = {
  RASCUNHO: "Solicitante (rascunho)",
  AGUARDANDO_SUPERVISOR: "Supervisor (CMilA / Diretoria DECEx)",
  AGUARDANDO_CONSOLIDADOR: "Consolidador do órgão vinculante",
  AGUARDANDO_CARTOGRAFICO: "Gestor Cartográfico — DSG",
  ATRIBUIDO_CGEO: "CGEO (em análise)",
  APROVADO: "CGEO (em atendimento)",
  PRODUZIDO: "Encerrado — produzido",
  REPROVADO: "Encerrado — inviável",
  CANCELADO: "Encerrado — cancelado",
};

export const STATUS_COLORS: Record<StatusPedido, string> = {
  RASCUNHO: "bg-zinc-700/50 text-zinc-300 border border-zinc-600/30",
  AGUARDANDO_SUPERVISOR:
    "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  AGUARDANDO_CONSOLIDADOR:
    "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  AGUARDANDO_CARTOGRAFICO:
    "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  ATRIBUIDO_CGEO:
    "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  APROVADO: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  REPROVADO: "bg-red-500/10 text-red-400 border border-red-500/20",
  CANCELADO: "bg-zinc-800/50 text-zinc-500 border border-zinc-700/30",
  PRODUZIDO: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
};

/** Status simplificado do ponto de vista do SOLICITANTE.
 *  Pedidos em trânsito (em revisão por qualquer escalão) = "Enviado".
 *  Apenas RASCUNHO = "Não enviado". */
export interface StatusSolicitante {
  label: string;
  cls: string; // classes Tailwind para o pill
}

export function getStatusSolicitante(status: StatusPedido): StatusSolicitante {
  switch (status) {
    case "RASCUNHO":
      return {
        label: "Não enviado",
        cls: "bg-zinc-700/40 text-zinc-400 border border-zinc-600/30",
      };
    case "AGUARDANDO_SUPERVISOR":
    case "AGUARDANDO_CONSOLIDADOR":
    case "AGUARDANDO_CARTOGRAFICO":
    case "ATRIBUIDO_CGEO":
    case "APROVADO":
      return {
        label: "Enviado",
        cls: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
      };
    case "PRODUZIDO":
      return {
        label: "Produto disponível",
        cls: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
      };
    case "REPROVADO":
      return {
        label: "Inviável",
        cls: "bg-red-500/10 text-red-400 border border-red-500/20",
      };
    case "CANCELADO":
      return {
        label: "Cancelado",
        cls: "bg-zinc-800/50 text-zinc-500 border border-zinc-700/30",
      };
    default:
      return {
        label: status,
        cls: "bg-zinc-700/40 text-zinc-400 border border-zinc-600/30",
      };
  }
}

export interface ItemPedido {
  id: number;
  tipo_produto: TipoProduto;
  escala: Escala;
  inom: string;
  mi: string | null;
  disponivel_bdgex: boolean;
  data_producao_bdgex: string | null;
  solicitar_mesmo_disponivel: boolean;
  prioridade: number;
  impressao_quantidade: number | null;
  impressao_tipo_material: string | null;
}

export interface Pedido {
  id: number;
  usuario_id: number;
  operacao_id: number | null;
  data_entrega: string;
  status: StatusPedido;
  prioridade: number;
  finalidade_geo: string | null;
  finalidade: string | null;
  orgao_vinculante: string;
  motivo_reprovacao: string | null;
  observacoes: string | null;
  link_bdgex: string | null;
  criado_em: string;
  atualizado_em: string;
  itens: ItemPedido[];
  regiao_militar: string | null;
  diretoria: string | null;
  usuario_nome: string | null;
  operacao_nome: string | null;
  criador_id: number | null;
  criador_nome: string | null;
  cgeo_id?: number | null;
  auto_submitted?: boolean;
  // Dados de contato do solicitante (enriquecidos pelo backend)
  usuario_om?: string | null;
  usuario_email?: string | null;
  usuario_telefone?: string | null;
  usuario_telefone_ritex?: string | null;
  usuario_secao_om?: string | null;
  usuario_perfil?: string | null;
  usuario_posto_graduacao?: string | null;
  usuario_nome_de_guerra?: string | null;
  cadeia_aprovacao: string[];
  impressao_solicitada?: boolean;
  impressao_quantidade?: number | null;
  impressao_tipo_material?: string | null;
}

/** Configuração de impressão física associada a um item do carrinho (1:1). */
export interface ItemImpressao {
  id: string; // == cartKey(item) — chave idêntica ao produtoId
  produtoId: string; // FK → CartItem via cartKey()
  quantidade: number;
  tipo: MaterialImpressao;
}

export interface CartItem {
  inom: string;
  mi: string | null;
  tipo_produto: TipoProduto;
  escala: Escala;
  solicitar_mesmo_disponivel: boolean;
  disponivel_bdgex: boolean;
  data_producao_bdgex: string | null;
  geom?: object;
  /** true quando o usuário solicitou impressão física para este item */
  impressao: boolean;
  /** FK → ItemImpressao.id; null enquanto !impressao */
  impressaoId: string | null;
}
