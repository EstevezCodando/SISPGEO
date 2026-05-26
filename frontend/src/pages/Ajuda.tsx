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
      "Representação planialtimétrica do terreno com símbolos e convenções cartográficas. Inclui relevo (curvas de nível), hidrografia, vegetação, edificações, vias e limites. Entregue em formato digital e/ou impresso.",
    usos: [
      "Orientação e navegação no terreno",
      "Medição de distâncias, áreas e rumos",
      "Planejamento de operações e manobras",
    ],
    prazo: "180 dias",
  },
  {
    sigla: "COI",
    nome: "Carta Ortoimagem",
    imagem: "/cartaortoimagem.png",
    definicao:
      "Combinação entre ortoimagem georreferenciada e um conjunto reduzido de informações vetoriais (hidrografia, rodovias, relevo). Permite identificação visual e localização simultâneas.",
    usos: [
      "Orientação combinando imagem real e cartografia",
      "Reconhecimento de feições e obstáculos",
      "Verificação de dados cartográficos em campo",
    ],
    prazo: "60 dias",
  },
  {
    sigla: "OI",
    nome: "Ortoimagem",
    imagem: "/ortoimagem.png",
    definicao:
      "Imagem aérea ou orbital corrigida geometricamente (georreferenciada) sem vetores cartográficos sobrepostos. Fiel à realidade do terreno na data de aquisição.",
    usos: [
      "Identificação e localização de feições naturais e artificiais",
      "Atualização de banco de dados cartográficos",
      "Monitoramento de áreas de interesse",
    ],
    prazo: "40 dias",
  },
  {
    sigla: "MDT",
    nome: "Modelo Digital do Terreno",
    imagem: "/mdt.png",
    definicao:
      "Representação numérica contínua da altitude do terreno sem obstáculos artificiais ou vegetação (somente o chão). Formato de grade matricial.",
    usos: [
      "Cálculo de declividade e trafegabilidade",
      "Planejamento de obras de engenharia",
      "Modelagem hidrológica e de bacias",
    ],
    prazo: "40 dias",
  },
  {
    sigla: "MDS",
    nome: "Modelo Digital de Superfície",
    imagem: "/mds.png",
    definicao:
      "Similar ao MDT, porém inclui a altura de obstáculos naturais (árvores) e artificiais (edificações). Representa a superfície visível do ambiente.",
    usos: [
      "Análise de visada e linha de tiro",
      "Planejamento de telecomunicações e comunicações táticas",
      "Determinação de cobertura vegetal e edificada",
    ],
    prazo: "40 dias",
  },
  {
    sigla: "CDGV",
    nome: "Conjunto de Dados Geoespaciais Vetoriais",
    imagem: "/cdgv.png",
    definicao:
      "Feições do terreno (naturais e artificiais) em formato vetorial — pontos, linhas e polígonos — com atributos textuais associados. Base de dados estruturada para uso em SIG.",
    usos: [
      "Integração em Sistemas de Informação Geográfica (SIG)",
      "Simulação tática e análise de terreno automatizada",
      "Produção derivada de outros produtos cartográficos",
    ],
    prazo: "180 dias",
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
  // Fecha com Escape
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
        {/* Botão fechar */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-zinc-800 border border-white/10 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col md:flex-row">
          {/* Imagem grande */}
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

          {/* Conteúdo */}
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
        {/* Imagem de preview — maior que antes */}
        <div className="relative w-full h-48 bg-zinc-900 overflow-hidden border-b border-white/5">
          <img
            src={produto.imagem}
            alt={produto.nome}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          {/* Overlay com hint de zoom */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-zinc-900/80 border border-white/20 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
              <ZoomIn className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs text-zinc-300">Ver detalhes</span>
            </div>
          </div>
        </div>

        {/* Info compacta */}
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
  uso: string;
  detalhe: string;
}

const ESCALAS: Escala[] = [
  {
    valor: "1:25.000",
    imagem: "/25k.png",
    area: "≈ 12 × 8 km por folha",
    uso: "Operações táticas de pequena unidade, engenharia de campanha",
    detalhe: "Máximo detalhe — menor área coberta por folha",
  },
  {
    valor: "1:50.000",
    imagem: "/50k.png",
    area: "≈ 24 × 16 km por folha",
    uso: "Padrão operacional — batalha, reconhecimento, planejamento tático",
    detalhe: "Equilíbrio entre detalhe e cobertura — escala mais solicitada",
  },
  {
    valor: "1:100.000",
    imagem: "/100k.png",
    area: "≈ 48 × 32 km por folha",
    uso: "Planejamento de brigada e divisão, logística",
    detalhe: "Cobertura regional com detalhe médio",
  },
  {
    valor: "1:250.000",
    imagem: "/250k.png",
    area: "≈ 120 × 80 km por folha",
    uso: "Visão estratégica, planejamento de campanha, itinerários",
    detalhe: "Menor detalhe — maior área coberta por folha",
  },
];

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
        {/* Grid dashed */}
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

        {/* Eixos */}
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

        {/* Setas dos eixos */}
        <polygon
          points={`${PAD.left - 4},${PAD.top + 8} ${PAD.left + 4},${PAD.top + 8} ${PAD.left},${PAD.top}`}
          fill="#52525b"
        />
        <polygon
          points={`${W - PAD.right - 8},${H - PAD.bottom - 4} ${W - PAD.right - 8},${H - PAD.bottom + 4} ${W - PAD.right},${H - PAD.bottom}`}
          fill="#52525b"
        />

        {/* Label eixo Y */}
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

        {/* Label eixo X */}
        <text
          x={PAD.left + innerW / 2}
          y={H - 6}
          fill="#a1a1aa"
          fontSize="11"
          textAnchor="middle"
        >
          Tempo de produção
        </text>

        {/* Rótulos extremos Y */}
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

        {/* Rótulos extremos X */}
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

        {/* Bolhas */}
        {COMPLEXIDADE_DATA.map((p) => {
          const cx = toX(p.x);
          const cy = toY(p.y);
          const isHov = hovered === p.nome;
          const r = isHov ? 13 : 9;

          // calcular posição do label para evitar sobreposição com borda
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
              {/* Aura */}
              <circle
                cx={cx}
                cy={cy}
                r={isHov ? 24 : 0}
                fill={p.hex}
                fillOpacity="0.10"
                style={{ transition: "r 0.2s ease, fill-opacity 0.2s ease" }}
              />
              {/* Bolha */}
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
              {/* Nome (multi-linha via tspan) */}
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

        {/* Tooltip */}
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

      {/* Legenda */}
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
        internacional.{" "}
        <strong className="text-zinc-300">MI</strong> (Mapa Índice) é o código
        numérico simplificado utilizado no Sistema Cartográfico Nacional. No mapa
        de seleção, cada célula representa uma folha cartográfica identificada
        pelo seu código INOM/MI.
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
              OM → Supervisor → [Órgão] → DSG → CGEO
            </p>
          </div>
        </div>
        <p>
          Você será notificado por e-mail em cada movimentação. Acompanhe o
          status em <span className="text-emerald-400">"Meus Pedidos"</span>.
        </p>
      </div>
    ),
  },
];

// ─── Fluxo ───────────────────────────────────────────────────────────────────

const FLUXO_COTER = [
  { perfil: "OMDS", acao: "Cria e submete o pedido", cor: "emerald" },
  { perfil: "C Mil. A", acao: "Supervisor revisa e encaminha", cor: "amber" },
  { perfil: "COTER", acao: "Consolida e envia à DSG", cor: "yellow" },
  { perfil: "DSG", acao: "Valida e atribui ao CGEO", cor: "blue" },
  { perfil: "CGEO", acao: "Analisa, produz e disponibiliza no BDGEx", cor: "purple" },
];

const FLUXO_OUTROS = [
  { perfil: "OMDS", acao: "Cria e submete o pedido", cor: "emerald" },
  { perfil: "Supervisor", acao: "Revisa e encaminha ao órgão", cor: "amber" },
  { perfil: "DEC / COLOG / DECEx", acao: "Consolida e envia à DSG", cor: "orange" },
  { perfil: "DSG", acao: "Valida e atribui ao CGEO", cor: "blue" },
  { perfil: "CGEO", acao: "Analisa, produz e disponibiliza no BDGEx", cor: "purple" },
];

const COR: Record<string, string> = {
  emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  amber:   "bg-amber-500/10   border-amber-500/30   text-amber-400",
  yellow:  "bg-yellow-500/10  border-yellow-500/30  text-yellow-400",
  orange:  "bg-orange-500/10  border-orange-500/30  text-orange-400",
  blue:    "bg-blue-500/10    border-blue-500/30    text-blue-400",
  purple:  "bg-purple-500/10  border-purple-500/30  text-purple-400",
};

// ─── Tutoriais ───────────────────────────────────────────────────────────────

const TUTORIAIS = {
  solicitar: [
    {
      n: "1",
      title: 'Acesse "Solicitar Produtos"',
      desc: 'No menu lateral, clique em "Solicitar Produtos". A página carregará com o formulário de seleção.',
    },
    {
      n: "2",
      title: "Escolha o produto e a escala",
      desc: "Selecione o tipo de produto (ex.: Carta Topográfica) e a escala (ex.: 1:50.000). O mapa será atualizado com a grade INOM correspondente.",
    },
    {
      n: "3",
      title: "Defina a data de entrega",
      desc: "Informe quando precisa do produto. O sistema calcula automaticamente a data mínima conforme o prazo de produção.",
    },
    {
      n: "4",
      title: "Selecione folhas no mapa",
      desc: 'Clique nas células da área de interesse. Folhas verdes já existem no BDGEx — marque "Solicitar mesmo disponível" se precisar de versão atualizada.',
    },
    {
      n: "5",
      title: "Preencha a finalidade e submeta",
      desc: 'Informe a finalidade operacional, revise o carrinho e clique em "Submeter Pedido". O pedido entrará na fila de envio.',
    },
  ],
  editar: [
    {
      n: "1",
      title: 'Acesse "Meus Pedidos"',
      desc: 'No menu lateral, clique em "Meus Pedidos" para ver todos os seus pedidos.',
    },
    {
      n: "2",
      title: "Localize o pedido a editar",
      desc: 'Apenas pedidos em rascunho (ainda não enviados) podem ser editados. Pedidos já encaminhados para a cadeia de comando estão bloqueados.',
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
      desc: 'Em "Meus Pedidos" o banner mostra a data de encerramento e quantos dias restam. Fique atento ao alerta vermelho de urgência.',
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
}

const JORNADAS: JornadaGuia[] = [
  {
    perfil: "OMDS — Solicitar Produtos",
    cor: "emerald",
    passos: TUTORIAIS.solicitar,
  },
  {
    perfil: "C Mil. A — Revisar Pedidos",
    cor: "amber",
    passos: [
      {
        n: "1",
        title: 'Acesse "Pedidos Pendentes"',
        desc: "Os pedidos submetidos pelas OMDS da sua região aparecem automaticamente na lista.",
      },
      {
        n: "2",
        title: "Expanda e verifique os itens",
        desc: "Clique na seta de cada pedido para ver os itens, contatos e finalidade. Remova itens desnecessários se preciso.",
      },
      {
        n: "3",
        title: "Reordene por prioridade",
        desc: "Arraste as linhas para ordenar os pedidos do mais ao menos urgente antes de encaminhar.",
      },
      {
        n: "4",
        title: "Selecione e encaminhe",
        desc: 'Marque os pedidos desejados com a caixa de seleção e clique em "Encaminhar ao COTER". Ou use o botão para encaminhar todos de uma vez.',
      },
      {
        n: "5",
        title: "Cancele se necessário",
        desc: "Use o botão de cancelamento (🚫) para reprovar pedidos inviáveis informando o motivo.",
      },
    ],
  },
  {
    perfil: "COTER — Consolidador",
    cor: "yellow",
    passos: [
      {
        n: "1",
        title: 'Acesse "Pedidos Pendentes"',
        desc: "Os pedidos consolidados pelos C Mil. A das regiões militares subordinadas ao COTER aparecem em sua fila.",
      },
      {
        n: "2",
        title: "Revise duplicatas",
        desc: "O sistema alertará automaticamente sobre pedidos duplicados (mesmo INOM, produto e escala). Decida se encaminha mesmo assim.",
      },
      {
        n: "3",
        title: "Encaminhe à DSG",
        desc: 'Selecione pedidos ou use "Enviar à DSG (todos)" para encaminhar o lote completo.',
      },
    ],
  },
  {
    perfil: "DEC / COLOG / DECEx — Supervisor",
    cor: "orange",
    passos: [
      {
        n: "1",
        title: 'Acesse "Pedidos Pendentes"',
        desc: "Os pedidos das OM subordinadas ao seu órgão chegam diretamente a sua fila — sem passar pelo C Mil. A.",
      },
      {
        n: "2",
        title: "Expanda e verifique os itens",
        desc: "Verifique itens, contatos e finalidade de cada pedido. Remova itens desnecessários se preciso.",
      },
      {
        n: "3",
        title: "Reordene por prioridade",
        desc: "Arraste as linhas para ordenar do mais ao menos urgente antes de encaminhar.",
      },
      {
        n: "4",
        title: "Encaminhe ao consolidador do órgão",
        desc: "Selecione os pedidos e encaminhe ao Consolidador do seu órgão (DEC, COLOG ou DECEx). Ou use o botão para encaminhar todos de uma vez.",
      },
      {
        n: "5",
        title: "Cancele se necessário",
        desc: "Use o botão de cancelamento para reprovar pedidos inviáveis, informando o motivo.",
      },
    ],
  },
  {
    perfil: "DEC / COLOG / DECEx — Consolidador",
    cor: "orange",
    passos: [
      {
        n: "1",
        title: 'Acesse "Pedidos Pendentes"',
        desc: "Os pedidos encaminhados pelo Supervisor do seu órgão chegam à sua fila para consolidação final.",
      },
      {
        n: "2",
        title: "Revise duplicatas",
        desc: "O sistema alertará sobre pedidos duplicados (mesmo INOM, produto e escala). Decida se encaminha mesmo assim.",
      },
      {
        n: "3",
        title: "Encaminhe à DSG",
        desc: 'Selecione pedidos ou use "Enviar à DSG (todos)" para encaminhar o lote completo ao Gestor Cartográfico.',
      },
    ],
  },
  {
    perfil: "DSG/CGEO — Avaliar Pedidos",
    cor: "blue",
    passos: [
      {
        n: "1",
        title: 'Acesse "Pedidos Pendentes"',
        desc: "Visualize todos os pedidos recebidos da cadeia de comando (COTER, DEC, COLOG, DECEx e DSG).",
      },
      {
        n: "2",
        title: "Atribua ao CGEO",
        desc: "Encaminhe pedidos para análise e produção pelo CGEO executor.",
      },
      {
        n: "3",
        title: "Disponibilize no BDGEx",
        desc: "Após produção, informe o link BDGEx. O solicitante e toda a cadeia receberão notificação.",
      },
    ],
  },
];

// ─── Card de escala (expande inline com imagem + descrição) ──────────────────

function EscalaCard({ escala }: { escala: Escala }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`bg-zinc-800/50 border rounded-xl overflow-hidden transition-all duration-200 ${
        expanded
          ? "border-emerald-500/40 md:col-span-2"
          : "border-white/5 hover:border-emerald-500/20"
      }`}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left group focus:outline-none"
      >
        {/* Imagem */}
        <div
          className="relative bg-zinc-900 border-b border-white/5 overflow-hidden"
          style={{
            height: expanded ? "200px" : "120px",
            transition: "height 0.25s ease",
          }}
        >
          <img
            src={escala.imagem}
            alt={`Escala ${escala.valor}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          {!expanded && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-end justify-end p-2">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-zinc-900/80 border border-white/20 rounded px-2 py-1 flex items-center gap-1">
                <ZoomIn className="h-3 w-3 text-emerald-400" />
                <span className="text-[10px] text-zinc-300">Expandir</span>
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-emerald-400 font-mono">
              {escala.valor}
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">{escala.area}</p>
          </div>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-zinc-500 shrink-0 mt-0.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0 mt-0.5" />
          )}
        </div>
      </button>

      {/* Detalhe expandido */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-white/5 pt-2.5 space-y-1.5">
          <p className="text-xs text-zinc-400 leading-relaxed">{escala.uso}</p>
          <p className="text-[11px] text-emerald-500/80 italic">
            {escala.detalhe}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Componentes utilitários ─────────────────────────────────────────────────

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-emerald-400">{icon}</span>
      <h2 className="font-semibold text-zinc-100 text-base">{title}</h2>
    </div>
  );
}

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

// ─── Video Tutorial Accordion ────────────────────────────────────────────────
function VideoTutorialAccordion({
  title,
  icon,
  videoSrc,
  descricao,
  passos,
}: {
  title: string;
  icon: ReactNode;
  videoSrc: string;
  descricao: string;
  passos: { n: string; title: string; desc: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors gap-4"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-emerald-400">{icon}</span>
          <span className="text-sm font-semibold text-zinc-200">{title}</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
        )}
      </button>
      {open && (
        <div className="border-t border-white/5">
          {/* Vídeo */}
          <div className="bg-zinc-950 px-5 pt-5">
            <video
              src={videoSrc}
              controls
              className="w-full rounded-xl border border-white/10 max-h-[480px] bg-zinc-950"
              preload="metadata"
            />
          </div>
          {/* Descrição + passos */}
          <div className="px-5 py-5 space-y-4">
            <p className="text-sm text-zinc-400 leading-relaxed">{descricao}</p>
            {passos.length > 0 && (
              <ol className="space-y-3.5 border-t border-white/5 pt-4">
                {passos.map((s) => (
                  <li key={s.n} className="flex gap-3">
                    <span className="w-6 h-6 shrink-0 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold flex items-center justify-center">
                      {s.n}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-200">
                        {s.title}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                        {s.desc}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tutorial Accordion ───────────────────────────────────────────────────────
function TutorialAccordion({
  title,
  icon,
  passos,
}: {
  title: string;
  icon: ReactNode;
  passos: { n: string; title: string; desc: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors gap-4"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-emerald-400">{icon}</span>
          <span className="text-sm font-semibold text-zinc-200">{title}</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-white/5 pt-4">
          <ol className="space-y-3.5">
            {passos.map((s) => (
              <li key={s.n} className="flex gap-3">
                <span className="w-6 h-6 shrink-0 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold flex items-center justify-center">
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
        </div>
      )}
    </div>
  );
}

// ─── Jornada Card ─────────────────────────────────────────────────────────────
const COR_JORNADA: Record<string, string> = {
  emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  amber:   "bg-amber-500/10   border-amber-500/30   text-amber-400",
  yellow:  "bg-yellow-500/10  border-yellow-500/30  text-yellow-400",
  orange:  "bg-orange-500/10  border-orange-500/30  text-orange-400",
  blue:    "bg-blue-500/10    border-blue-500/30    text-blue-400",
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
        </div>
      )}
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────

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

      {/* ── 1. CATÁLOGO DE PRODUTOS ─────────────────────────────────── */}
      <section className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
        <SectionTitle
          icon={<BookOpen className="h-4 w-4" />}
          title="Produtos disponíveis"
        />
        <p className="text-xs text-zinc-500 mb-4">
          Clique em qualquer produto para visualizar a imagem ampliada e os
          detalhes completos.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {PRODUTOS.map((p) => (
            <ProdutoCard key={p.sigla} produto={p} />
          ))}
        </div>
      </section>

      {/* ── 1b. MATERIAIS DE IMPRESSÃO ──────────────────────────────── */}
      <section className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
        <SectionTitle
          icon={<FileText className="h-4 w-4" />}
          title="Materiais de impressão"
        />
        <p className="text-xs text-zinc-500 mb-4">
          Ao solicitar impressão de Carta Topográfica ou Carta Ortoimagem,
          escolha o tipo de material conforme a finalidade operacional.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              nome: "Canvas",
              icon: "🖼",
              desc: "Tecido sintético resistente, impermeável e durável. Ideal para uso prolongado em campo, suporta dobramento repetido e umidade. Recomendado para operações de longa duração.",
              destaque: "Alta durabilidade · Impermeável",
            },
            {
              nome: "Sulfite",
              icon: "📄",
              desc: "Papel comum (75–90 g/m²). Opção econômica para uso interno, briefings e documentação temporária. Não resiste à umidade. Adequado para ambientes controlados.",
              destaque: "Econômico · Uso interno",
            },
            {
              nome: "Glossy",
              icon: "✨",
              desc: "Papel fotográfico brilhante de alta resolução. Oferece reprodução fiel de cores e detalhes, ideal para apresentações, exposições e arquivos de alta qualidade visual.",
              destaque: "Alta resolução · Visual premium",
            },
            {
              nome: "Tyvek",
              icon: "🏕",
              desc: "Material sintético extremamente resistente (polietileno de alta densidade). À prova d'água, rasgo e dobramento intenso. Indicado para operações em ambientes adversos — selva, campo úmido, embarque.",
              destaque: "Prova d'água · Máxima resistência",
            },
          ].map((m) => (
            <div
              key={m.nome}
              className="bg-zinc-800/50 border border-white/5 rounded-xl p-4 flex gap-3"
            >
              <span className="text-2xl shrink-0">{m.icon}</span>
              <div>
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
            </div>
          ))}
        </div>
      </section>

      {/* ── 2. ESCALAS ──────────────────────────────────────────────── */}
      <section className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
        <SectionTitle
          icon={<ZoomIn className="h-4 w-4" />}
          title="Escalas cartográficas"
        />

        <p className="text-sm text-zinc-400 leading-relaxed mb-5">
          A escala indica a relação entre a distância no mapa e a distância real
          no terreno.
          <span className="text-zinc-200">
            {" "}
            Menor denominador = maior detalhe = menor área por folha.
          </span>{" "}
          Escolha a escala conforme o nível de planejamento e a área de
          interesse.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {ESCALAS.map((esc) => (
            <EscalaCard key={esc.valor} escala={esc} />
          ))}
        </div>

        {/* Card: Complexidade × Tempo de produção */}
        <div className="mt-4 bg-zinc-800/30 border border-white/5 rounded-xl p-4">
          <p className="text-xs font-semibold text-zinc-300 mb-3 tracking-wide uppercase">
            Complexidade × Tempo de produção
          </p>
          <ComplexidadeChart />
        </div>
      </section>

      {/* ── 4. FLUXO DE APROVAÇÃO ───────────────────────────────────── */}
      <section className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
        <SectionTitle
          icon={<FileText className="h-4 w-4" />}
          title="Fluxo hierárquico do pedido"
        />
        <p className="text-xs text-zinc-500 mb-5">
          O caminho do pedido depende da subordinação da OM. Há dois fluxos
          distintos conforme o órgão vinculante.
        </p>

        {/* Fluxo COTER */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wide mb-2">
            Subordinados ao COTER
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            {FLUXO_COTER.map((s, i) => (
              <div key={s.perfil} className="flex items-center gap-2">
                <div className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${COR[s.cor]}`}>
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

        {/* Fluxo outros órgãos */}
        <div>
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-2">
            Subordinados a DEC / COLOG / DECEx
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            {FLUXO_OUTROS.map((s, i) => (
              <div key={s.perfil} className="flex items-center gap-2">
                <div className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${COR[s.cor]}`}>
                  <span className="block font-semibold">{s.perfil}</span>
                  <span className="font-normal opacity-70">{s.acao}</span>
                </div>
                {i < FLUXO_OUTROS.length - 1 && (
                  <span className="text-zinc-700 text-lg">→</span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-zinc-600 leading-relaxed">
            Neste fluxo o pedido não passa pelo C Mil. A — vai diretamente ao
            Supervisor e depois ao Consolidador do órgão.
          </p>
        </div>

        <p className="mt-5 text-xs text-zinc-600 leading-relaxed border-t border-white/5 pt-4">
          Gestores podem consolidar múltiplos pedidos e encaminhá-los em lote ao
          escalão seguinte. Notificações por e-mail são enviadas em cada
          movimentação.
        </p>
      </section>

      {/* ── 5. STATUS DOS PEDIDOS ───────────────────────────────────── */}
      <section className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
        <SectionTitle
          icon={<CheckCircle className="h-4 w-4" />}
          title="Status dos pedidos"
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {[
            { label: "Rascunho",             desc: "Criado, ainda não enviado — pode ser editado" },
            { label: "Enviado / Em revisão", desc: "Em análise na cadeia de aprovação" },
            { label: "Aguardando DSG",       desc: "Recebido pela DSG" },
            { label: "Em Atendimento",       desc: "Atribuído ao CGEO para produção" },
            { label: "Produzido",            desc: "Disponível no BDGEx ✓" },
            { label: "Cancelado/Reprovado",  desc: "Encerrado sem produção" },
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
      </section>

      {/* ── 6. TUTORIAIS ────────────────────────────────────────────── */}
      <section className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
        <SectionTitle
          icon={<BookOpen className="h-4 w-4" />}
          title="Tutoriais"
        />
        <p className="text-xs text-zinc-500 mb-4">
          Clique em cada guia para expandir o passo a passo e assistir ao vídeo.
        </p>
        <div className="space-y-2">
          {/* Como solicitar produtos */}
          <VideoTutorialAccordion
            title="Como solicitar produtos?"
            icon={<Send className="h-4 w-4" />}
            videoSrc="/TutorialSolicitarProdutos.mp4"
            descricao="Aprenda a navegar no mapa INOM, selecionar as folhas de interesse, definir escala e data de entrega, e submeter seu pedido ao C Mil. A — tudo em poucos cliques."
            passos={TUTORIAIS.solicitar}
          />

          {/* O que é MI? */}
          <VideoTutorialAccordion
            title="O que é MI?"
            icon={<FileText className="h-4 w-4" />}
            videoSrc="/TutorialMI.mp4"
            descricao="O MI (Mapa Índice) é o código numérico simplificado que identifica cada folha cartográfica no Sistema Cartográfico Nacional. Entenda como o MI se relaciona com o INOM e como localizá-lo no mapa de seleção."
            passos={[]}
          />

          {/* Janela de Solicitações */}
          <TutorialAccordion
            title="O que é a Janela de Solicitações?"
            icon={<CheckCircle className="h-4 w-4" />}
            passos={TUTORIAIS.janela}
          />
        </div>
      </section>

      {/* ── 7. GUIAS POR JORNADA ────────────────────────────────────── */}
      <section className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
        <SectionTitle
          icon={<Send className="h-4 w-4" />}
          title="Guias por perfil"
        />
        <p className="text-xs text-zinc-500 mb-4">
          Selecione seu perfil para ver o guia específico de cada jornada.
        </p>
        <div className="space-y-2">
          {JORNADAS.map((j) => (
            <JornadaCard key={j.perfil} jornada={j} />
          ))}
        </div>
      </section>

      {/* ── 8. FAQ ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <HelpCircle className="h-4 w-4 text-emerald-400" />
          <h2 className="font-semibold text-zinc-100">Perguntas frequentes</h2>
        </div>
        {FAQS.map((faq) => (
          <FAQItem key={faq.q} {...faq} />
        ))}
      </section>

      {/* Contato */}
      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 flex items-start gap-4">
        <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-zinc-200">
            Precisa de suporte?
          </p>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            Entre em contato com a equipe técnica da DSG pelo e-mail
            institucional ou acione seu Gestor DSG pelo sistema. Mantenha seus
            dados atualizados em{" "}
            <span className="text-emerald-400">"Meus Dados"</span> para receber
            notificações corretamente.
          </p>
        </div>
      </div>
    </div>
  );
}
