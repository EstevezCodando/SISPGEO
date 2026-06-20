/**
 * Dados estáticos da página de Ajuda.
 * Extraído de pages/Ajuda.tsx para reduzir o tamanho do componente.
 */
import type { ReactNode } from "react";

// ─── Catálogo de produtos ────────────────────────────────────────────────────

export interface Produto {
  sigla: string;
  nome: string;
  imagem: string;
  definicao: string;
  usos: string[];
  prazo: string;
}

export const PRODUTOS: Produto[] = [
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

// ─── Escalas (objetos ricos para exibição na tela de Ajuda) ─────────────────
// Nota: diferente de types/pedido.ts ESCALAS (array de strings para o formulário)

export interface EscalaDetalhe {
  valor: string;
  imagem: string;
  area: string;
  uso: string;
  detalhe: string;
}

export const ESCALAS_DETALHE: EscalaDetalhe[] = [
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

export interface ProdutoComplexidade {
  nome: string;
  prazo: string;
  complexidade: number;
  x: number;
  y: number;
  hex: string;
}

export const COMPLEXIDADE_DATA: ProdutoComplexidade[] = [
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

// ─── FAQ ─────────────────────────────────────────────────────────────────────

export interface FAQ {
  q: string;
  a: ReactNode;
}

export const FAQS: FAQ[] = [
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

// ─── Fluxo de aprovação ───────────────────────────────────────────────────────

export const FLUXO_COTER = [
  { perfil: "OMDS", acao: "Cria e submete o pedido", cor: "emerald" },
  { perfil: "C Mil. A", acao: "Supervisor revisa e encaminha", cor: "amber" },
  { perfil: "COTER", acao: "Consolida e envia à DSG", cor: "yellow" },
  { perfil: "DSG", acao: "Valida e atribui ao CGEO", cor: "blue" },
  {
    perfil: "CGEO",
    acao: "Analisa, produz e disponibiliza no BDGEx",
    cor: "purple",
  },
];

export const FLUXO_OUTROS = [
  { perfil: "OMDS", acao: "Cria e submete o pedido", cor: "emerald" },
  {
    perfil: "DEC / COLOG / DECEx",
    acao: "Consolida e envia à DSG",
    cor: "orange",
  },
  { perfil: "DSG", acao: "Valida e atribui ao CGEO", cor: "blue" },
  {
    perfil: "CGEO",
    acao: "Analisa, produz e disponibiliza no BDGEx",
    cor: "purple",
  },
];

export const COR_FLUXO: Record<string, string> = {
  emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  amber: "bg-amber-500/10   border-amber-500/30   text-amber-400",
  yellow: "bg-yellow-500/10  border-yellow-500/30  text-yellow-400",
  orange: "bg-orange-500/10  border-orange-500/30  text-orange-400",
  blue: "bg-blue-500/10    border-blue-500/30    text-blue-400",
  purple: "bg-purple-500/10  border-purple-500/30  text-purple-400",
};

// ─── Tutoriais ───────────────────────────────────────────────────────────────

export const TUTORIAIS = {
  solicitar: [
    {
      n: "1",
      title: "Acesse o Formulário de Solicitação de Produtos",
      desc: 'No menu lateral, clique em "Solicitar Produtos" para carregar a página com o Formulário de Solicitação de Produtos.',
    },
    {
      n: "2",
      title: "Defina a Finalidade da Geoinformação",
      desc: "Considere as opções apresentadas. Esta informação deverá ser complementada posteriormente por ocasião da revisão do pedido.",
    },
    {
      n: "3",
      title: "Escolha o Produto e a Escala de Representação",
      desc: "Selecione o tipo de produto (ex. Carta Topográfica) e a escala de representação (ex. 1:50.000) que melhor atendam aos objetivos de utilização da Geoinformação (ver detalhes).",
    },
    {
      n: "4",
      title: "Defina a Data Sugerida de Entrega",
      desc: "Informe a data sugerida para a entrega do produto, considerando o prazo mínimo estimado para a produção do tipo de produto selecionado (ver detalhes). Cabe ressaltar que a data efetiva de entrega dependerá de outros fatores, como por exemplo, da descentralização de recursos orçamentários e do volume total de demandas de produção.",
    },
    {
      n: "5",
      title:
        "Selecione o Enquadramento dos Produtos no Mapa e Adicione ao Carrinho",
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
      desc: "Verifique se os pedidos solicitados estão listados no carrinho. Caso tenha interesse na impressão dos produtos adicionados, marcar a opção e informar a quantidade e tipo de material desejável. Tyvek esta condicionados à disponibilidade e podem ser eventualmente fornecidos em Sulfite.",
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

// ─── Jornadas por perfil ──────────────────────────────────────────────────────
// Importa JornadaGuia do componente para manter a interface em um único lugar

import type { JornadaGuia } from "../components/ajuda/JornadaCard";

export const JORNADAS: JornadaGuia[] = [
  {
    perfil: "OMDS – Solicitante",
    cor: "emerald",
    passos: TUTORIAIS.solicitar,
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
