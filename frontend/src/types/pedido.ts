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

/** Prioridade que um escalão atribuiu ao encaminhar o pedido. */
export interface PrioridadeEncaminhamento {
  escalao: string;
  escopo: string;
  ciclo: number;
  prioridade: number;
  definida_em: string;
}

export const ESCALAO_LABELS: Record<string, string> = {
  SOLICITANTE: "Solicitante",
  SUPERVISOR: "Supervisor",
  CONSOLIDADOR: "Consolidador",
  GESTOR_CARTOGRAFICO: "Gestor Cartográfico",
};

// Grafia correta das siglas guardadas no `escopo` (que vem em caixa alta do
// enum de perfis). Sem isto a cadeia exibiria "DETMIL"/"DECEX".
const SIGLAS: Record<string, string> = {
  DESMIL: "DESMil", DETMIL: "DETMil", DEPA: "DEPA",
  DPHCEX: "DPHCEx", CCFEX: "CCFEx",
  DECEX: "DECEx", COTER: "COTER", DSG: "DSG", DEC: "DEC", COLOG: "COLOG",
  CMP: "CMP", CML: "CML", CMS: "CMS", CMO: "CMO",
  CMAO: "CMAO", CMA: "CMA", CMNE: "CMNE", CMSE: "CMSE",
};

/**
 * Unidade a que pertence quem atribuiu a prioridade.
 *
 * O `escopo` identifica a sequência: `SOLICITANTE:<id>`, `SUPERVISOR_CMP`,
 * `CONSOLIDADOR_DECEX`. Para o solicitante o escopo só traz o id, então a OM
 * vem do próprio pedido.
 */
export function unidadeDoEscopo(
  escopo: string,
  omSolicitante?: string | null,
): string {
  if (escopo.startsWith("SOLICITANTE")) return omSolicitante ?? "";
  const sufixo = escopo.replace(/^(SUPERVISOR|CONSOLIDADOR)_/, "").split(":")[0];
  return SIGLAS[sufixo] ?? sufixo;
}

/** Ex.: "Solicitante EsLog: Prioridade 1" */
export function eloDaCadeia(
  pr: PrioridadeEncaminhamento,
  omSolicitante?: string | null,
): string {
  const nivel = ESCALAO_LABELS[pr.escalao] ?? pr.escalao;
  const unidade = unidadeDoEscopo(pr.escopo, omSolicitante);
  const quem = unidade ? `${nivel} ${unidade}` : nivel;
  return `${quem}: Prioridade ${pr.prioridade}`;
}

/**
 * Cadeia completa de priorização, do escalão mais antigo ao mais recente.
 * Ex.: "Solicitante EsLog: Prioridade 1 → Supervisor DETMil: Prioridade 3
 *       → Consolidador DECEx: Prioridade 1"
 */
export function cadeiaPrioridades(
  prioridades: PrioridadeEncaminhamento[] | undefined,
  omSolicitante?: string | null,
): string {
  if (!prioridades || prioridades.length === 0) return "";
  return prioridades.map((pr) => eloDaCadeia(pr, omSolicitante)).join("  →  ");
}

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
  removido?: boolean;
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
  /** Ordem de trabalho do escalão que detém o pedido (o que o arrasto altera). */
  ordem_fila?: number;
  /** Quando o pedido chegou ao escalão atual (a "leva" do envio). */
  encaminhado_em?: string | null;
  /** Prioridade que cada escalão atribuiu ao encaminhar — do mais antigo ao mais recente. */
  prioridades?: PrioridadeEncaminhamento[];
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

// ─── Ordenação por prioridade ─────────────────────────────────────────────────
// `prioridade` vale 0 por padrão e só recebe um valor >= 1 quando alguém
// reordena a lista (arrastar no dashboard). Logo 0 significa "ainda não
// priorizado" — e NÃO "primeira prioridade". Um `a.prioridade - b.prioridade`
// cru colocaria um pedido nunca arrastado à frente daquele que o supervisor
// marcou explicitamente como nº 1. Espelha `chave_prioridade` do backend
// (backend/app/routers/pedidos.py).

/** Comparador para `Array.prototype.sort`: não priorizados (0) vão para o fim. */
export function porPrioridade<T extends { prioridade: number }>(a: T, b: T): number {
  const pa = a.prioridade || 0;
  const pb = b.prioridade || 0;
  if (pa === 0 && pb === 0) return 0;
  if (pa === 0) return 1;
  if (pb === 0) return -1;
  return pa - pb;
}

// ─── MI para exibição ─────────────────────────────────────────────────────────
// O número base do MI é gravado sempre com 4 dígitos (`0091`, `0490`), mas na
// escala 1:250.000 a nomenclatura usa 3 — ali o zero à esquerda é só
// preenchimento. Nas demais escalas o 4º dígito é significativo (`2263` em
// 1:100.000), então nada pode ser removido.
//
// É só apresentação: o valor gravado no banco e o que sai nas exportações
// continuam com os 4 dígitos.

/** MI como deve ser lido na tela. Remove o zero de preenchimento no 1:250.000. */
export function formatarMI(
  mi: string | null | undefined,
  escala?: string | null,
): string {
  if (!mi) return "";
  if (escala !== "1:250.000") return mi;
  // Remove um único zero: `0091` → `091`, preservando os 3 dígitos.
  return mi.replace(/^0(\d{3})$/, "$1");
}

/**
 * Prioridade com que o pedido chegou ao escalão atual — o número do selo.
 *
 * Prefere o histórico, que diz exatamente qual escalão carimbou o quê. Sem
 * histórico, cai para `prioridade` do próprio pedido: os pedidos anteriores à
 * criação da tabela de histórico têm o número, mas não o registro, e mesmo
 * assim precisam exibir a sua classificação.
 *
 * Devolve `null` quando não há prioridade nenhuma — aí o selo não aparece.
 */
export function prioridadeRecebida(pedido: {
  prioridade?: number;
  prioridades?: PrioridadeEncaminhamento[];
}): number | null {
  const ultima = pedido.prioridades?.[pedido.prioridades.length - 1];
  if (ultima) return ultima.prioridade;
  return pedido.prioridade && pedido.prioridade > 0 ? pedido.prioridade : null;
}
