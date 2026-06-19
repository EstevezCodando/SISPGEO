import {
    BookOpen,
    CheckCircle,
    ChevronDown,
    ChevronUp,
    FileText,
    HelpCircle,
    Send,
    X,
    ZoomIn,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

// ─── Catálogo de produtos ────────────────────────────────────────────────────

interface Produto {
  sigla: string;
  nome: string;
  imagem: string;
  definicao: string;
  usos: string[];
  prazo: string;
}

const PRODUTOS: Produto[] = [
  {
    sigla: "CT",
    nome: "Carta Topográfica",
    imagem: "/cartatopografica.png",
    definicao:
      "Representação convencional das informações planialtimétricas do terreno por meio de símbolos e convenções cartográficas padronizadas, proporcionando identificação ágil e interpretação clara dos elementos representados. O produto é disponibilizado em formato digital e impresso.",
    usos: [
      "Orientação no terreno",
      "Identificação e localização de feições geoespaciais",
      "Realização de medições de distâncias, áreas e direções",
    ],
    prazo: "180 dias",
  },
  {
    sigla: "CDGV",
    nome: "Conjunto de Dados Geoespaciais Vetoriais",
    imagem: "/cdgv.png",
    definicao:
      "Representação de elementos do terreno, naturais e artificiais, por meio de objetos geométricos do tipo ponto, linha e polígono, contendo seus respectivos atributos descritivos associados. O produto é disponibilizado em formato digital.",
    usos: [
      "Utilização como base de dados para Sistemas de Informação e Simulação",
      "Análises espaciais fundamentadas na localização e na geometria das feições",
      "Consulta e exploração dos atributos descritivos associados às feições",
    ],
    prazo: "180 dias",
  },
  {
    sigla: "COI",
    nome: "Carta Ortoimagem",
    imagem: "/cartaortoimagem.png",
    definicao:
      "Representação de um conjunto selecionado de informações planialtimétricas, tais como hidrografia, sistema viário e relevo, sobrepostas a uma Ortoimagem, favorecendo a contextualização espacial e a interpretação das feições representadas. O produto é disponibilizado em formato digital e impresso.",
    usos: [
      "Orientação no terreno",
      "Identificação e localização de feições geoespaciais",
      "Determinação de distâncias, áreas e direções",
    ],
    prazo: "60 dias",
  },
  {
    sigla: "OI",
    nome: "Ortoimagem",
    imagem: "/ortoimagem.png",
    definicao:
      "Representação do terreno por meio de imagem georreferenciada, sem a incorporação de elementos vetoriais. O produto é disponibilizado em formato digital e impresso.",
    usos: [
      "Identificação e localização de feições naturais e artificiais do terreno, sujeitas à interpretação do usuário",
    ],
    prazo: "40 dias",
  },
  {
    sigla: "MDT",
    nome: "Modelo Digital do Terreno",
    imagem: "/mdt.png",
    definicao:
      "Representação contínua das altitudes da superfície terrestre, desconsiderando a presença de obstáculos naturais e artificiais, tais como árvores e edificações. O produto é disponibilizado em formato digital.",
    usos: [
      "Planejamento de obras de engenharia",
      "Determinação da declividade do terreno",
      "Avaliação das condições de trafegabilidade",
    ],
    prazo: "40 dias",
  },
  {
    sigla: "MDS",
    nome: "Modelo Digital de Superfície",
    imagem: "/mds.png",
    definicao:
      "Representação contínua das altitudes da superfície terrestre, contemplando a presença de obstáculos naturais e artificiais, tais como árvores e edificações. O produto é disponibilizado em formato digital.",
    usos: [
      "Determinação das condições de visada sobre tropas",
      "Avaliação de trafegabilidade do terreno",
      "Planejamento e implantação de infraestrutura de comunicações",
    ],
    prazo: "40 dias",
  },
  {
    sigla: "IMP-CT",
    nome: "Impressão de Carta Topográfica",
    imagem: "/cartatopografica.png",
    definicao:
      "Serviço de impressão de Carta Topográfica já existente no acervo BDGEx. Não envolve nova produção cartográfica — apenas reprodução física da folha solicitada, podendo ser em diferentes tipos de material.",
    usos: [
      "Uso em campo sem disponibilidade de meios digitais",
      "Briefings e apresentações operacionais",
      "Arquivo físico de documentação cartográfica",
    ],
    prazo: "30 dias",
  },
  {
    sigla: "IMP-COI",
    nome: "Impressão de Carta Ortoimagem",
    imagem: "/cartaortoimagem.png",
    definicao:
      "Serviço de impressão de Carta Ortoimagem já existente no acervo BDGEx. Combina imagem de satélite e informações vetoriais em folha impressa para uso operacional em campo.",
    usos: [
      "Reconhecimento de área combinando imagem real e cartografia",
      "Uso em campo sem disponibilidade de meios digitais",
      "Documentação de operações e exercícios",
    ],
    prazo: "30 dias",
  },
];

// ─── Modal de produto (imagem grande + descrição) ────────────────────────────

function ProdutoModal({
  produto,
  onClose,
}: {
  produto: Produto;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-zinc-800 border border-white/10 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col md:flex-row">
          <div className="md:w-[55%] bg-zinc-950 flex items-center justify-center min-h-[240px] md:min-h-[400px]">
            <img
              src={produto.imagem}
              alt={produto.nome}
              className="w-full h-full object-contain max-h-[480px]"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>

          <div className="md:w-[45%] p-6 flex flex-col justify-between border-t md:border-t-0 md:border-l border-white/10">
            <div>
              <h3 className="text-base font-semibold text-zinc-100 mb-3">
                {produto.nome}
              </h3>

              <p className="text-sm text-zinc-400 leading-relaxed mb-5">
                {produto.definicao}
              </p>

              <div className="mb-5">
                <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide mb-2">
                  Principais usos
                </p>
                <ul className="space-y-1.5">
                  {produto.usos.map((u) => (
                    <li
                      key={u}
                      className="text-sm text-zinc-400 flex gap-2 items-start"
                    >
                      <span className="text-emerald-500 mt-0.5 shrink-0">
                        ▸
                      </span>
                      {u}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10">
              <p className="text-xs text-zinc-500">
                Prazo mínimo de produção:{" "}
                <span className="text-emerald-400 font-semibold text-sm">
                  {produto.prazo}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Card de produto (clicável, abre modal) ───────────────────────────────────

function ProdutoCard({ produto }: { produto: Produto }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group text-left w-full bg-zinc-800/50 border border-white/5 rounded-xl overflow-hidden hover:border-emerald-500/30 hover:bg-zinc-800/80 transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
      >
        <div className="relative w-full h-48 bg-zinc-900 overflow-hidden border-b border-white/5">
          <img
            src={produto.imagem}
            alt={produto.nome}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-zinc-900/80 border border-white/20 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
              <ZoomIn className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs text-zinc-300">Ver detalhes</span>
            </div>
          </div>
        </div>

        <div className="p-4">
          <p className="text-sm font-semibold text-zinc-100 mb-1.5">
            {produto.nome}
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">
            {produto.definicao}
          </p>
          <p className="text-[11px] text-zinc-600 mt-2">
            Prazo mín.:{" "}
            <span className="text-zinc-400 font-medium">{produto.prazo}</span>
          </p>
        </div>
      </button>

      {open && (
        <ProdutoModal produto={produto} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

// ─── Escalas ─────────────────────────────────────────────────────────────────

interface Escala {
  valor: string;
  imagem: string;
  area: string;
}

const ESCALAS: Escala[] = [
  {
    valor: "1:25.000",
    imagem: "/25k.png",
    area: "7'30\" × 7'30\" (≈ 14 × 14 km por folha)",
  },
  {
    valor: "1:50.000",
    imagem: "/50k.png",
    area: "15' × 15' (≈ 28 × 28 km por folha)",
  },
  {
    valor: "1:100.000",
    imagem: "/100k.png",
    area: "30' × 30' (≈ 55 × 55 km por folha)",
  },
  {
    valor: "1:250.000",
    imagem: "/250k.png",
    area: "1° × 1°30' (≈ 111 × 165 km por folha)",
  },
];

// ─── Card de escala (estático — figura + escala + dimensões) ─────────────────

function EscalaCard({ escala }: { escala: Escala }) {
  return (
    <div className="bg-zinc-800/50 border border-white/5 rounded-xl overflow-hidden">
      <div className="relative w-full h-32 bg-zinc-900 border-b border-white/5">
        <img
          src={escala.imagem}
          alt={`Escala ${escala.valor}`}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
      <div className="p-3">
        <p className="text-sm font-bold text-emerald-400 font-mono">
          {escala.valor}
        </p>
        <p className="text-[11px] text-zinc-400 mt-0.5">{escala.area}</p>
      </div>
    </div>
  );
}

// ─── Complexidade × Tempo de produção ────────────────────────────────────────

interface ProdutoComplexidade {
  nome: string;
  prazo: string;
  complexidade: number;
  x: number;
  y: number;
  hex: string;
}

const COMPLEXIDADE_DATA: ProdutoComplexidade[] = [
  {
    nome: "Impressão",
    prazo: "30 dias",
    complexidade: 1,
    x: 4,
    y: 8,
    hex: "#10b981",
  },
  {
    nome: "Ortoimagem/MDT/MDS",
    prazo: "40 dias",
    complexidade: 2,
    x: 18,
    y: 25,
    hex: "#38bdf8",
  },
  {
    nome: "Carta Ortoimagem",
    prazo: "60 dias",
    complexidade: 3,
    x: 32,
    y: 50,
    hex: "#a78bfa",
  },
  {
    nome: "CDGV (Vetores)",
    prazo: "180 dias",
    complexidade: 4,
    x: 72,
    y: 72,
    hex: "#fbbf24",
  },
  {
    nome: "Carta Topográfica",
    prazo: "180 dias",
    complexidade: 5,
    x: 85,
    y: 90,
    hex: "#fb7185",
  },
];

function ComplexidadeChart() {
  const [hovered, setHovered] = useState<string | null>(null);
  const PAD = { top: 24, right: 24, bottom: 52, left: 58 };
  const W = 560,
    H = 310;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const toX = (v: number) => PAD.left + (v / 100) * innerW;
  const toY = (v: number) => PAD.top + innerH - (v / 100) * innerH;

  const gridLines = [25, 50, 75];

  const hov = hovered
    ? (COMPLEXIDADE_DATA.find((d) => d.nome === hovered) ?? null)
    : null;

  return (
    <div className="relative select-none">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ fontFamily: "inherit" }}
      >
        {gridLines.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              y1={toY(v)}
              x2={W - PAD.right}
              y2={toY(v)}
              stroke="#3f3f46"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <line
              x1={toX(v)}
              y1={PAD.top}
              x2={toX(v)}
              y2={H - PAD.bottom}
              stroke="#3f3f46"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          </g>
        ))}

        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={H - PAD.bottom}
          stroke="#52525b"
          strokeWidth="1.5"
        />
        <line
          x1={PAD.left}
          y1={H - PAD.bottom}
          x2={W - PAD.right}
          y2={H - PAD.bottom}
          stroke="#52525b"
          strokeWidth="1.5"
        />

        <polygon
          points={`${PAD.left - 4},${PAD.top + 8} ${PAD.left + 4},${PAD.top + 8} ${PAD.left},${PAD.top}`}
          fill="#52525b"
        />
        <polygon
          points={`${W - PAD.right - 8},${H - PAD.bottom - 4} ${W - PAD.right - 8},${H - PAD.bottom + 4} ${W - PAD.right},${H - PAD.bottom}`}
          fill="#52525b"
        />

        <text
          x={13}
          y={H / 2}
          fill="#a1a1aa"
          fontSize="11"
          textAnchor="middle"
          transform={`rotate(-90, 13, ${H / 2})`}
        >
          Complexidade
        </text>

        <text
          x={PAD.left + innerW / 2}
          y={H - 6}
          fill="#a1a1aa"
          fontSize="11"
          textAnchor="middle"
        >
          Tempo de produção
        </text>

        <text
          x={PAD.left - 7}
          y={toY(8) + 3}
          fill="#71717a"
          fontSize="9"
          textAnchor="end"
        >
          Baixa
        </text>
        <text
          x={PAD.left - 7}
          y={toY(92) + 3}
          fill="#71717a"
          fontSize="9"
          textAnchor="end"
        >
          Alta
        </text>

        <text
          x={toX(4)}
          y={H - PAD.bottom + 13}
          fill="#71717a"
          fontSize="9"
          textAnchor="middle"
        >
          Rápido
        </text>
        <text
          x={toX(96)}
          y={H - PAD.bottom + 13}
          fill="#71717a"
          fontSize="9"
          textAnchor="middle"
        >
          Demorado
        </text>

        {COMPLEXIDADE_DATA.map((p) => {
          const cx = toX(p.x);
          const cy = toY(p.y);
          const isHov = hovered === p.nome;
          const r = isHov ? 13 : 9;

          const labelY = cy + r + 13;
          const clampedLabelX = Math.max(
            PAD.left + 20,
            Math.min(cx, W - PAD.right - 20),
          );

          return (
            <g
              key={p.nome}
              onMouseEnter={() => setHovered(p.nome)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={cx}
                cy={cy}
                r={isHov ? 24 : 0}
                fill={p.hex}
                fillOpacity="0.10"
                style={{ transition: "r 0.2s ease, fill-opacity 0.2s ease" }}
              />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={p.hex}
                fillOpacity={isHov ? 0.95 : 0.65}
                stroke={p.hex}
                strokeWidth={isHov ? 2 : 1.5}
                style={{ transition: "all 0.2s ease" }}
              />
              {p.nome.split(" ").length <= 2 ? (
                <text
                  x={clampedLabelX}
                  y={labelY}
                  fill={isHov ? p.hex : "#71717a"}
                  fontSize="9"
                  textAnchor="middle"
                  style={{
                    transition: "fill 0.2s ease",
                    fontWeight: isHov ? 600 : 400,
                  }}
                >
                  {p.nome}
                </text>
              ) : (
                <text
                  x={clampedLabelX}
                  y={labelY}
                  fill={isHov ? p.hex : "#71717a"}
                  fontSize="9"
                  textAnchor="middle"
                  style={{
                    transition: "fill 0.2s ease",
                    fontWeight: isHov ? 600 : 400,
                  }}
                >
                  {p.nome.split(" ").map((w, i) => (
                    <tspan key={i} x={clampedLabelX} dy={i === 0 ? 0 : 10}>
                      {w}
                    </tspan>
                  ))}
                </text>
              )}
            </g>
          );
        })}

        {hov &&
          (() => {
            const cx = toX(hov.x);
            const cy = toY(hov.y);
            const tw = 138,
              th = 50;
            const tx = Math.min(cx + 16, W - PAD.right - tw - 2);
            const ty = Math.max(cy - th / 2, PAD.top + 2);
            return (
              <g style={{ pointerEvents: "none" }}>
                <rect
                  x={tx}
                  y={ty}
                  width={tw}
                  height={th}
                  rx="7"
                  fill="#18181b"
                  stroke={hov.hex}
                  strokeWidth="1.2"
                  strokeOpacity="0.7"
                />
                <text
                  x={tx + 10}
                  y={ty + 15}
                  fill={hov.hex}
                  fontSize="10"
                  fontWeight="600"
                >
                  {hov.nome}
                </text>
                <text x={tx + 10} y={ty + 29} fill="#a1a1aa" fontSize="9">
                  ⏱ {hov.prazo}
                </text>
                <text x={tx + 10} y={ty + 43} fill="#a1a1aa" fontSize="9">
                  {"★".repeat(hov.complexidade)}
                  {"☆".repeat(5 - hov.complexidade)}
                </text>
              </g>
            );
          })()}
      </svg>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-1 px-1">
        {COMPLEXIDADE_DATA.map((p) => (
          <button
            key={p.nome}
            className="flex items-center gap-1.5 group"
            onMouseEnter={() => setHovered(p.nome)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform group-hover:scale-125"
              style={{ backgroundColor: p.hex }}
            />
            <span
              className={`text-[10px] transition-colors ${hovered === p.nome ? "text-zinc-200" : "text-zinc-500"}`}
            >
              {p.nome}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

interface FAQ {
  q: string;
  a: ReactNode;
}

const FAQS: FAQ[] = [
  {
    q: "Como sei se o produto já existe no BDGEx?",
    a: (
      <>
        Ao selecionar a escala no formulário, o mapa exibe em verde as folhas
        que já constam no Banco de Dados Geoespaciais do Exército (BDGEx). Esses
        produtos podem ser obtidos diretamente sem solicitação de nova produção
        — mas você pode marcar "Solicitar mesmo disponível" se precisar de
        versão atualizada. Acesse o BDGEx em:{" "}
        <a
          href="https://bdgex.eb.mil.br"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors"
        >
          bdgex.eb.mil.br
        </a>
      </>
    ),
  },
  {
    q: "Por que a data mínima de entrega está tão no futuro?",
    a: "Cada produto tem um prazo mínimo de produção técnica a partir de uma data base global configurada pela DSG: Carta Topográfica e CDGV = 180 dias; Carta Ortoimagem = 60 dias; Ortoimagem / MDT / MDS = 40 dias; Impressão = 30 dias. O sistema bloqueia automaticamente datas anteriores ao mínimo calculado.",
  },
  {
    q: "O que é INOM e MI?",
    a: (
      <>
        <strong className="text-zinc-300">INOM</strong> (Índice de Nomenclatura)
        é o código oficial que identifica cada folha cartográfica em padrão
        internacional. <strong className="text-zinc-300">MI</strong> (Mapa
        Índice) é o código numérico simplificado utilizado no Sistema
        Cartográfico Nacional. No mapa de seleção, cada célula representa uma
        folha cartográfica identificada pelo seu código INOM/MI.
      </>
    ),
  },
  {
    q: "Posso cancelar um pedido após submetê-lo?",
    a: (
      <>
        Sim — enquanto o pedido não for recebido pela DSG é possível cancelá-lo.
        Entre em contato com seu supervisor imediato:{" "}
        <span className="text-zinc-300">
          C Mil. A (para OM subordinadas ao COTER)
        </span>{" "}
        ou diretamente com o responsável do órgão ao qual sua OM está vinculada
        (DEC, COLOG, DECEx etc.).
      </>
    ),
  },
  {
    q: "Meu pedido foi enviado. O que acontece agora?",
    a: (
      <div className="space-y-3">
        <p>
          Após o envio, o pedido percorre a cadeia de aprovação. O caminho
          depende da subordinação da sua OM:
        </p>
        <div className="space-y-2 pl-2 border-l-2 border-emerald-500/30">
          <div>
            <p className="text-zinc-300 font-medium text-xs mb-0.5">
              Subordinados ao COTER
            </p>
            <p className="text-xs text-zinc-500">
              OM → C Mil. A → COTER → DSG → CGEO
            </p>
          </div>
          <div>
            <p className="text-zinc-300 font-medium text-xs mb-0.5">
              Subordinados a outros órgãos (DEC, COLOG, DECEx)
            </p>
            <p className="text-xs text-zinc-500">
              OM → [Órgão Consolidador] → DSG → CGEO
            </p>
          </div>
        </div>
        <p>
          Você será notificado por e-mail em cada movimentação. Acompanhe o
          status em <span className="text-emerald-400">"Ver Pedidos"</span>.
        </p>
      </div>
    ),
  },
];

// ─── Fluxo ───────────────────────────────────────────────────────────────────

const FLUXO_COTER = [
  { perfil: "OMDS", acao: "Cria e submete o pedido", cor: "emerald" },
  { perfil: "C Mil A", acao: "Revisa, prioriza e encaminha o pedido ao COTER", cor: "amber" },
  { perfil: "COTER", acao: "Consolida, prioriza e encaminha o pedido à DSG", cor: "yellow" },
  { perfil: "DSG", acao: "Valida e atribui o pedido ao CGEO", cor: "blue" },
  { perfil: "CGEO", acao: "Produz e disponibiliza o pedido no BDGEx", cor: "purple" },
];

const FLUXO_OUTROS = [
  { perfil: "OMDS", acao: "Cria e submete o pedido", cor: "emerald" },
  { perfil: "Diretorias Subordinadas", acao: "Revisa, prioriza e encaminha o pedido ao ODS", cor: "amber" },
  { perfil: "DEC, COLOG e DECEX", acao: "Consolida, prioriza e encaminha o pedido à DSG", cor: "orange" },
  { perfil: "DSG", acao: "Valida e atribui o pedido ao CGEO", cor: "blue" },
  { perfil: "CGEO", acao: "Produz e disponibiliza o pedido no BDGEx", cor: "purple" },
];

const COR: Record<string, string> = {
  emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  amber: "bg-amber-500/10   border-amber-500/30   text-amber-400",
  yellow: "bg-yellow-500/10  border-yellow-500/30  text-yellow-400",
  orange: "bg-orange-500/10  border-orange-500/30  text-orange-400",
  blue: "bg-blue-500/10    border-blue-500/30    text-blue-400",
  purple: "bg-purple-500/10  border-purple-500/30  text-purple-400",
};

// ─── Tutoriais (passo a passo por jornada) ───────────────────────────────────

const TUTORIAIS = {
  solicitar: [
    {
      n: "1",
      title: "Acesse o Formulário de Solicitação de Produtos",
      desc: 'Clique em "Solicitar Produtos" no menu lateral para carregar a página com o Formulário de Solicitação de Produtos.',
    },
    {
      n: "2",
      title: "Escolha o Tipo de Produto/Serviço e a Escala de Representação",
      desc: "Selecione o tipo de produto (ex. Carta Topográfica) e a escala de representação (ex. 1:50.000) que melhor atendam aos objetivos de utilização da Geoinformação (ver detalhes).",
    },
    {
      n: "3",
      title: "Defina a Finalidade da Geoinformação",
      desc: "Selecione a finalidade da Geoinformação, considerando as opções apresentadas. Esta informação deverá ser complementada posteriormente por ocasião da revisão do pedido.",
    },
    {
      n: "4",
      title: "Defina a Data Sugerida de Entrega",
      desc: "Informe a data sugerida para a entrega do produto, considerando o prazo mínimo estimado para a produção do tipo de produto selecionado (ver detalhes). Cabe ressaltar que a data efetiva de entrega dependerá de outros fatores, como por exemplo, da descentralização de recursos orçamentários e do volume total de demandas de produção.",
    },
    {
      n: "5",
      title: "Selecione o Enquadramento dos Produtos no Mapa e Adicione ao Carrinho de Solicitações",
      desc: "Clique nas células sobre o mapa correspondentes às áreas de interesse, de modo a adicionar os produtos desejados ao carrinho. Cabe ressaltar que os mesmos podem ser removidos a qualquer tempo, antes da confirmação do pedido.",
    },
    {
      n: "6",
      title: "Complemente a Finalidade e Submeta o Pedido para Revisão",
      desc: 'Insira algumas informações adicionais acerca do pedido que possam ser consideradas no processo de homologação pelo escalão superior. Feito isso, clique no botão "Revisar Pedido".',
    },
    {
      n: "7",
      title: "Revise o Pedido",
      desc: "Verifique se os pedidos solicitados estão listados no carrinho. Caso tenha interesse na impressão dos produtos adicionados, marcar a opção e informar a quantidade e tipo de material desejável. Tyvek está condicionado à disponibilidade e pode ser eventualmente fornecido em Sulfite.",
    },
  ],
  editar: [
    {
      n: "1",
      title: 'Acesse "Ver Pedidos"',
      desc: 'No menu lateral, clique em "Ver Pedidos" para ver todos os seus pedidos.',
    },
    {
      n: "2",
      title: "Localize o pedido a editar",
      desc: "Apenas pedidos em rascunho (ainda não enviados) podem ser editados. Pedidos já encaminhados para a cadeia de comando estão bloqueados.",
    },
    {
      n: "3",
      title: 'Clique em "Editar"',
      desc: "Use o ícone de lápis ao lado do pedido. Você poderá alterar o produto, escala, data de entrega e finalidade.",
    },
    {
      n: "4",
      title: "Reordene ou remova itens",
      desc: "Arraste os itens para reordenar por prioridade. Use o ícone de lixeira para remover itens individuais.",
    },
    {
      n: "5",
      title: "Salve as alterações",
      desc: 'Clique em "Salvar" para confirmar. As mudanças ficam salvas em rascunho até o envio.',
    },
  ],
  janela: [
    {
      n: "1",
      title: "O que é a Janela?",
      desc: "A Janela de Solicitação é o período definido pelo Gestor DSG durante o qual os pedidos podem ser criados, editados e enviados. Fora da janela, novas solicitações são bloqueadas.",
    },
    {
      n: "2",
      title: "Acompanhe a contagem",
      desc: 'Em "Ver Pedidos" o banner mostra a data de encerramento e quantos dias restam. Fique atento ao alerta vermelho de urgência.',
    },
    {
      n: "3",
      title: "Envio automático",
      desc: "Ao fim da janela, pedidos em rascunho são encaminhados automaticamente. Você não precisa fazer nada — mas é recomendável enviar antes para revisar.",
    },
    {
      n: "4",
      title: "Janela ainda não aberta",
      desc: "Se a janela ainda não foi configurada pelo Gestor DSG, o sistema exibirá uma mensagem informando a data de abertura. Aguarde.",
    },
  ],
};

interface JornadaGuia {
  perfil: string;
  cor: string;
  passos: { n: string; title: string; desc: string }[];
  nota?: string;
  notaUrl?: string;
}

const JORNADAS: JornadaGuia[] = [
  {
    perfil: "OMDS – Solicitante",
    cor: "emerald",
    passos: TUTORIAIS.solicitar,
    nota: "Recomenda-se a visualização deste vídeo tutorial para a correta realização do cadastro dos pedidos de Geoinformação.",
    notaUrl: "/TutorialSolicitarProdutos.mp4",
  },
  {
    perfil: "C Mil A – Supervisor",
    cor: "amber",
    passos: [
      {
        n: "1",
        title: "Acesse a relação de 'Pedidos Pendentes'",
        desc: "No menu lateral, clique em 'Pedidos Pendentes' para visualizar a relação dos pedidos submetidos pelas suas OMDS e que se encontram pendentes de aprovação.",
      },
      {
        n: "2",
        title: "Expanda os Pedidos e Verifique os Produtos",
        desc: "Clique no pedido para visualizar os detalhes relativos aos pedidos submetidos (dados do responsável, finalidade do pedido e lista de produtos). É possível cancelar os pedidos.",
      },
      {
        n: "3",
        title: "Cancele os Pedidos Não Aprovados",
        desc: "Pedidos não aprovados podem ser eventualmente cancelados mediante justificativa prévia.",
      },
      {
        n: "4",
        title: "Reorganize a Prioridade dos Pedidos",
        desc: "Arraste as linhas de pacotes de pedidos para reorganizar a prioridade. Os pedidos na parte superior têm prioridade mais alta.",
      },
      {
        n: "5",
        title: "Encaminhe os Pedidos ao Consolidador (ODOp/ODS)",
        desc: "Marque os pedidos que serão encaminhados ao Consolidador (ODOp/ODS) e clique no botão de encaminhar. Se for o caso, é possível encaminhar todos de uma só vez.",
      },
    ],
  },
  {
    perfil: "COTER – Consolidador",
    cor: "yellow",
    passos: [
      {
        n: "1",
        title: "Acesse a relação de 'Pedidos Pendentes'",
        desc: "No menu lateral, clique em 'Pedidos Pendentes' para visualizar a relação dos pedidos submetidos pelos seus C Mil A subordinados e que se encontram pendentes de aprovação.",
      },
      {
        n: "2",
        title: "Revise os Pedidos Duplicados",
        desc: "Clique no pedido para visualizar os detalhes relativos aos pedidos submetidos (dados do responsável, finalidade do pedido e lista de produtos). O sistema alertará automaticamente sobre pedidos duplicados (mesmo Tipo de Produto e MI/MIR).",
      },
      {
        n: "3",
        title: "Encaminhe os Pedidos à DSG",
        desc: "Marque os pedidos que serão encaminhados à DSG e clique no botão de encaminhar. Se for o caso, é possível encaminhar todos de uma só vez.",
      },
    ],
  },
  {
    perfil: "DEC / COLOG / DECEx – Consolidador",
    cor: "orange",
    passos: [
      {
        n: "1",
        title: "Acesse a relação de 'Pedidos Pendentes'",
        desc: "No menu lateral, clique em 'Pedidos Pendentes' para visualizar a relação dos pedidos submetidos pelas suas OMDS e que se encontram pendentes de aprovação.",
      },
      {
        n: "2",
        title: "Revise os Pedidos Duplicados",
        desc: "Clique no pedido para visualizar os detalhes relativos aos pedidos submetidos (dados do responsável, finalidade do pedido e lista de produtos). O sistema alertará automaticamente sobre pedidos duplicados (mesmo Tipo de Produto e MI/MIR).",
      },
      {
        n: "3",
        title: "Encaminhe os Pedidos à DSG",
        desc: "Marque os pedidos que serão encaminhados à DSG e clique no botão de encaminhar. Se for o caso, é possível encaminhar todos de uma só vez.",
      },
    ],
  },
  {
    perfil: "DSG – Produtor",
    cor: "blue",
    passos: [
      {
        n: "1",
        title: "Acesse a relação de 'Pedidos Pendentes'",
        desc: "No menu lateral, clique em 'Pedidos Pendentes' para visualizar a relação dos pedidos submetidos para produção pelo ODOp e ODS, ainda com a produção pendente de aprovação.",
      },
      {
        n: "2",
        title: "Distribua os Pedidos aos Centros de Geoinformação",
        desc: "Encaminhe os pedidos para análise e produção pelo CGEO executor.",
      },
      {
        n: "3",
        title: "Disponibilize no BDGEx",
        desc: "Após produção, informe o link BDGEx. O solicitante e toda a cadeia receberão notificação.",
      },
    ],
  },
];

// ─── Componentes utilitários ─────────────────────────────────────────────────

function FAQItem({ q, a }: { q: string; a: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors gap-4"
      >
        <span className="text-sm font-medium text-zinc-200">{q}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-zinc-400 leading-relaxed border-t border-white/5 pt-3">
          {a}
        </div>
      )}
    </div>
  );
}

const COR_JORNADA: Record<string, string> = {
  emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  amber: "bg-amber-500/10   border-amber-500/30   text-amber-400",
  yellow: "bg-yellow-500/10  border-yellow-500/30  text-yellow-400",
  orange: "bg-orange-500/10  border-orange-500/30  text-orange-400",
  blue: "bg-blue-500/10    border-blue-500/30    text-blue-400",
};

function JornadaCard({ jornada }: { jornada: JornadaGuia }) {
  const [open, setOpen] = useState(false);
  const cls = COR_JORNADA[jornada.cor] ?? COR_JORNADA.emerald;
  return (
    <div className={`rounded-xl border overflow-hidden ${cls}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:opacity-80 transition-opacity gap-4"
      >
        <span className="text-sm font-semibold">{jornada.perfil}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-current/20 pt-3 bg-zinc-900/60">
          <ol className="space-y-3">
            {jornada.passos.map((s) => (
              <li key={s.n} className="flex gap-3">
                <span className="w-5 h-5 shrink-0 rounded-full bg-current/10 border border-current/30 text-[10px] font-bold flex items-center justify-center">
                  {s.n}
                </span>
                <div>
                  <p className="text-sm font-medium text-zinc-200">{s.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          {jornada.nota && (
            <p className="mt-3 text-xs text-zinc-400 leading-relaxed border-t border-white/5 pt-3">
              {jornada.notaUrl ? (
                <>
                  {jornada.nota.split("vídeo tutorial").map((part, i) =>
                    i === 0 ? (
                      <span key={i}>
                        {part}
                        <a
                          href={jornada.notaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:text-emerald-300 underline"
                        >
                          vídeo tutorial
                        </a>
                      </span>
                    ) : (
                      <span key={i}>{part}</span>
                    )
                  )}
                </>
              ) : (
                jornada.nota
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SubCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-zinc-800/40 border border-white/5 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-emerald-400">{icon}</span>
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────

const PRODUTOS_GEO = PRODUTOS.filter((p) => !p.sigla.startsWith("IMP"));
const PRODUTOS_IMP = PRODUTOS.filter((p) => p.sigla.startsWith("IMP"));

export function Ajuda() {
  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <HelpCircle className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
            Guia de Solicitação
          </h1>
          <p className="text-sm text-zinc-500">
            Conheça os produtos disponíveis e saiba como solicitar
          </p>
        </div>
      </div>

      {/* ── CARD 1: PRODUÇÃO DE GEOINFORMAÇÃO ───────────────────────── */}
      <section className="bg-zinc-900 border border-white/10 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 pb-4 border-b border-white/10">
          <BookOpen className="h-4 w-4 text-emerald-400" />
          <h2 className="font-semibold text-zinc-100 text-base">
            Produção de Geoinformação
          </h2>
        </div>

        {/* Sub-card: Tipos de Produtos */}
        <SubCard
          title="Tipos de Produtos"
          icon={<FileText className="h-3.5 w-3.5" />}
        >
          <p className="text-xs text-zinc-500">
            Clique no produto para visualizar a imagem ampliada e os respectivos
            detalhes.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {PRODUTOS_GEO.map((p) => (
              <ProdutoCard key={p.sigla} produto={p} />
            ))}
          </div>
        </SubCard>

        {/* Sub-card: Escalas de Representação */}
        <SubCard
          title="Escalas de Representação"
          icon={<ZoomIn className="h-3.5 w-3.5" />}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {ESCALAS.map((esc) => (
              <EscalaCard key={esc.valor} escala={esc} />
            ))}
          </div>
        </SubCard>
      </section>

      {/* ── CARD 2: IMPRESSÃO DE GEOINFORMAÇÃO ──────────────────────── */}
      <section className="bg-zinc-900 border border-white/10 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 pb-4 border-b border-white/10">
          <FileText className="h-4 w-4 text-emerald-400" />
          <h2 className="font-semibold text-zinc-100 text-base">
            Impressão de Geoinformação
          </h2>
        </div>

        {/* Sub-card: Tipos de Impressão */}
        <SubCard
          title="Tipos de Impressão"
          icon={<FileText className="h-3.5 w-3.5" />}
        >
          <p className="text-xs text-zinc-500">
            Clique no produto para visualizar a imagem ampliada e os respectivos
            detalhes.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {PRODUTOS_IMP.map((p) => (
              <ProdutoCard key={p.sigla} produto={p} />
            ))}
          </div>
        </SubCard>

        {/* Sub-card: Materiais de Impressão */}
        <SubCard
          title="Materiais de Impressão"
          icon={<BookOpen className="h-3.5 w-3.5" />}
        >
          <p className="text-xs text-zinc-500">
            Tipos de material para impressão, conforme a finalidade de
            utilização da Geoinformação.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                nome: "Papel Sulfite",
                desc: "Material de baixo custo de aquisição, adequado para anotações e escrita. Apresenta menor resistência mecânica, estando mais sujeito a rasgos e amassamentos. Indicado para: planejamento, instrução, reuniões de coordenação, estudos de situação, reconhecimento preliminar de áreas e atividades acadêmicas.",
                destaque: "Econômico · Uso interno",
              },
              {
                nome: "Papel Glossy",
                desc: "Material de custo intermediário, com acabamento de alta qualidade visual. Apresenta baixa resistência a amassamentos e pode sofrer desbotamento quando exposto prolongadamente à luz solar. Não é recomendado para escrita. Indicado para: exposição de produtos cartográficos.",
                destaque: "Alta qualidade visual · Exposição",
              },
              {
                nome: "Tyvek",
                desc: "Material de elevado custo de aquisição, que apresenta alta resistência a rasgos e à umidade. Não é recomendado para escrita. Indicado para: atividades de campo, operações militares, exercícios de adestramento, missões de reconhecimento e navegação terrestre.",
                destaque: "Alta resistência · Operações de campo",
              },
            ].map((m) => (
              <div
                key={m.nome}
                className="bg-zinc-800/50 border border-white/5 rounded-xl p-4"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-zinc-100">
                    {m.nome}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                    {m.destaque}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  {m.desc}
                </p>
              </div>
            ))}
          </div>
        </SubCard>
      </section>

      {/* ── CARD 3: SOLICITAÇÃO DE GEOINFORMAÇÃO ────────────────────── */}
      <section className="bg-zinc-900 border border-white/10 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 pb-4 border-b border-white/10">
          <Send className="h-4 w-4 text-emerald-400" />
          <h2 className="font-semibold text-zinc-100 text-base">
            Solicitação de Geoinformação
          </h2>
        </div>

        {/* Sub-card: Complexidade x Tempo de Entrega */}
        <SubCard
          title="Complexidade x Tempo de Entrega"
          icon={<BookOpen className="h-3.5 w-3.5" />}
        >
          <ComplexidadeChart />
        </SubCard>

        {/* Sub-card: Fluxo do Pedido */}
        <SubCard
          title="Fluxo do Pedido"
          icon={<Send className="h-3.5 w-3.5" />}
        >
          <p className="text-xs text-zinc-500">
            O caminho do pedido depende da subordinação da OM do solicitante.
          </p>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wide mb-2">
                Solicitante subordinado ao Órgão de Direção Operacional (COTER)
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                {FLUXO_COTER.map((s, i) => (
                  <div key={s.perfil} className="flex items-center gap-2">
                    <div
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${COR[s.cor]}`}
                    >
                      <span className="block font-semibold">{s.perfil}</span>
                      <span className="font-normal opacity-70">{s.acao}</span>
                    </div>
                    {i < FLUXO_COTER.length - 1 && (
                      <span className="text-zinc-700 text-lg">→</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-2">
                Solicitante subordinado a Órgão de Direção Setorial (ODS)
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                {FLUXO_OUTROS.map((s, i) => (
                  <div key={s.perfil} className="flex items-center gap-2">
                    <div
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${COR[s.cor]}`}
                    >
                      <span className="block font-semibold">{s.perfil}</span>
                      <span className="font-normal opacity-70">{s.acao}</span>
                    </div>
                    {i < FLUXO_OUTROS.length - 1 && (
                      <span className="text-zinc-700 text-lg">→</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="text-xs text-zinc-600 leading-relaxed border-t border-white/5 pt-3">
            Os pedidos podem ser encaminhados em lote, sendo enviadas as
            notificações por e-mail a cada movimentação.
          </p>
        </SubCard>

        {/* Sub-card: Status do Pedido */}
        <SubCard
          title="Status do Pedido"
          icon={<CheckCircle className="h-3.5 w-3.5" />}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {[
              {
                label: "Em Rascunho",
                desc: "Criado, mas ainda não enviado - pode ser editado",
              },
              {
                label: "Enviado / Em revisão",
                desc: "Em análise na cadeia de aprovação",
              },
              { label: "Aguardando DSG", desc: "Recebido pela DSG" },
              {
                label: "Em Atendimento",
                desc: "Atribuído ao CGEO para produção",
              },
              { label: "Produzido", desc: "Disponível no BDGEx" },
              { label: "Cancelado/Reprovado", desc: "Encerrado sem produção" },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-zinc-800/60 border border-white/5 rounded-lg px-3 py-2"
              >
                <p className="font-medium text-zinc-300">{s.label}</p>
                <p className="text-zinc-600 mt-0.5">{s.desc}</p>
              </div>
            ))}
          </div>
        </SubCard>
      </section>

      {/* ── CARD 4: INFORMAÇÕES DE SUPORTE ──────────────────────────── */}
      <section className="bg-zinc-900 border border-white/10 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 pb-4 border-b border-white/10">
          <HelpCircle className="h-4 w-4 text-emerald-400" />
          <h2 className="font-semibold text-zinc-100 text-base">
            Informações de Suporte
          </h2>
        </div>

        {/* Sub-card: Orientações por Perfil */}
        <SubCard
          title="Orientações por Perfil"
          icon={<Send className="h-3.5 w-3.5" />}
        >
          <p className="text-xs text-zinc-500">
            Selecione seu perfil para ver o guia específico de cada jornada.
          </p>
          <div className="space-y-2">
            {JORNADAS.map((j) => (
              <JornadaCard key={j.perfil} jornada={j} />
            ))}
          </div>
        </SubCard>

        {/* Sub-card: Perguntas Frequentes */}
        <SubCard
          title="Perguntas Frequentes"
          icon={<HelpCircle className="h-3.5 w-3.5" />}
        >
          <div className="space-y-2">
            {FAQS.map((faq) => (
              <FAQItem key={faq.q} {...faq} />
            ))}
          </div>
        </SubCard>

        {/* Sub-card: Contato */}
        <SubCard title="Contato" icon={<CheckCircle className="h-3.5 w-3.5" />}>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Em caso de dúvidas ou sugestões, entre em contato com a equipe
            técnica da DSG, preferencialmente pelos telefones{" "}
            <span className="text-zinc-200">(61) 3415-5237</span> e{" "}
            <span className="text-zinc-200">860-5237 (RITEx)</span> ou pelo
            e-mail institucional{" "}
            <a
              href="mailto:suporte.sispgeo@dsg.eb.mil.br"
              className="text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              suporte.sispgeo@dsg.eb.mil.br
            </a>
            . Lembre-se de manter as informações atualizadas na aba{" "}
            <span className="text-emerald-400">Meus Dados</span> para garantir o
            recebimento das notificações.
          </p>
        </SubCard>
      </section>
    </div>
  );
}
