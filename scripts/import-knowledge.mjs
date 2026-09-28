import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const questionBankPath = path.join(projectRoot, "js", "questions.js");
const args = process.argv.slice(2);
const sourceFlag = args.indexOf("--source");

if (sourceFlag === -1 || !args[sourceFlag + 1]) {
  throw new Error("Uso: npm run import:knowledge -- --source <diretório-PMP-BOOK-8>");
}

const sourceRoot = path.resolve(args[sourceFlag + 1]);
const sessionNumbers = Array.from({ length: 16 }, (_, index) => index + 1);
const areas = [
  { number: 1, id: "fundamentos", prefix: "fund", folder: "1. Fundamentos de gerenciamento de projetos e entrega de valor" },
  { number: 2, id: "ambiente-projeto", prefix: "area2", folder: "2. Ambiente do projeto, contexto organizacional, governança e PMO" },
  { number: 3, id: "abordagens-desenvolvimento", prefix: "area3", folder: "3. Abordagens de desenvolvimento, ciclo de vida e adaptação" },
  { number: 4, id: "lideranca-gerente", prefix: "area4", folder: "4. Mentalidade, papel do gerente de projetos e liderança" },
  { number: 5, id: "lideranca-equipe", prefix: "area5", folder: "5. Visão comum, liderança da equipe e conflitos" },
  { number: 6, id: "iniciacao-projeto", prefix: "area6", folder: "6. Iniciação do projeto e termo de abertura" },
  { number: 7, id: "stakeholders-conhecimento", prefix: "area7", folder: "7. Partes interessadas e transferência de conhecimento" },
  { number: 8, id: "planejamento-integrado", prefix: "area8", folder: "8. Planejamento integrado do projeto" }
];
const expectedActiveCounts = [132, 148, 184, 125, 139, 55, 210, 55];
const matchingOverrides = new Map([
  ["3-12-3", {
    hash: "ca71255c0090cd929c44a49ad17828b2b5b744d4f2c0b278d9c603b8b7910fbf",
    pairs: [
      ["Discutir os melhoramentos que podem ser feitos em sprints subsequentes", "Retrospectiva de Sprint"],
      ["Apresentar o desempenho do projeto para as partes interessadas", "Revisão de Sprint"],
      ["Verificar o progresso em direção à meta do sprint", "Execução de Sprint"],
      ["Fornecer estimativas de esforço necessárias para completar histórias de usuário", "Planejamento de Sprint"]
    ]
  }],
  ["3-12-7", {
    hash: "be27e3a5703adf373057977a9918f1721b2e857fc2cdbedeb8b549ce1fca812f",
    pairs: [
      ["Ágil", "Backlog do Produto"],
      ["Preditivo", "Relatórios de Desempenho do Trabalho"],
      ["Ágil", "Gráfico Burnup"]
    ]
  }],
  ["3-12-9", {
    hash: "beda297a24e51d832533b630bf2cc6e02586e04a44296ebd6820e93d2ce9a489",
    pairs: [
      ["Iterativo", "Os requisitos dinâmicos são repetidos sobre o trabalho inacabado para melhorá-lo e modificá-lo até que estejam corretos, mas entregues apenas uma vez."],
      ["Preditivo", "A maior parte do planejamento ocorre antecipadamente. A equipe se esforça para identificar o máximo de detalhes possível sobre os requisitos desde o início."],
      ["Incremental", "Os requisitos dinâmicos são executados uma vez para cada incremento, com entregas menores e frequentes."]
    ]
  }],
  ["8-2-3", {
    hash: "8783564df3ff06b1473dacc372fab0db85dd8ca5664be57f55535e5db70b1093",
    pairs: [
      ["Projeto B: aplicativo digital com requisitos emergentes, alto feedback de usuários e entregas frequentes.", "Plano adaptativo com backlog, ciclos curtos de feedback e revisões frequentes."],
      ["Projeto C: modernização de processo interno com marcos fixos, mas funcionalidades priorizadas por valor ao longo do projeto.", "Plano híbrido com marcos formais e entrega incremental priorizada por valor."],
      ["Projeto A: substituição de equipamento industrial com escopo contratual fechado, aprovação regulatória e forte dependência de fornecedores.", "Plano preditivo com linha de base, controles formais, aquisições e conformidade."]
    ]
  }],
  ["8-3-2", {
    hash: "3f494745ab1d36be2d2836e91bd57fa2f03624769d1699865388843c7fd517f2",
    pairs: [
      ["Projeto B: produto digital com requisitos emergentes e necessidade de validação frequente com usuários.", "Destino 1: Backlog priorizado e cadência de revisão frequente."],
      ["Projeto D: projeto com várias equipes, dependências críticas e necessidade de integrar planos.", "Destino 2: Plano de gerenciamento do projeto integrado e plano de entrega."],
      ["Projeto A: iniciativa regulada com escopo contratual estável, múltiplos fornecedores e auditorias obrigatórias.", "Destino 3: Plano integrado do projeto com linhas de base e governança formal."],
      ["Projeto C: projeto híbrido com marcos executivos fixos, mas funcionalidades priorizadas por valor.", "Destino 4: Plano híbrido com marcos formais e entregas incrementais."]
    ]
  }],
  ["8-4-2", {
    hash: "f48add3f5fc5b25ae9c3c2965115b461013204a991183d4e52dc3fd085ba1932",
    pairs: [
      ["Projeto B: produto digital com requisitos emergentes e validação frequente com usuários.", "Destino 1: Planejamento adaptativo com backlog, ciclos curtos e feedback frequente."],
      ["Projeto D: programa interno com dependências, riscos compartilhados e decisões integradas.", "Destino 2: Plano de gerenciamento do projeto integrado e plano de entrega."],
      ["Projeto A: contrato de engenharia com escopo estável, marcos regulatórios e fornecedores críticos.", "Destino 3: Planejamento preditivo com linhas de base, aquisições e conformidade."],
      ["Projeto C: projeto híbrido com linha de base para marcos executivos e backlog para funcionalidades.", "Destino 4: Planejamento híbrido com marcos formais e priorização incremental."]
    ]
  }],
  ["8-5-3", {
    hash: "d9cf9b37e69037da9abb85306e59b6d9fef40106231d0c367d74e96420851fe0",
    pairs: [
      ["Situação C: Comparar opções de entrega considerando valor, risco, dependências e restrições antes de recomendar uma abordagem integrada.", "Análise multicritério."],
      ["Situação A: Número limitado de alternativas discretas; é preciso encontrar a melhor combinação eliminando opções inviáveis durante a busca.", "Ramificação e delimitação."],
      ["Situação D: Alinhar visualmente objetivos, entregas, riscos, premissas e benefícios esperados com as partes interessadas.", "Canvas de Projeto."],
      ["Situação B: Muitas combinações possíveis de cronograma e recursos; a equipe quer explorar soluções aproximadas em amplo espaço de alternativas.", "Algoritmos genéticos."]
    ]
  }],
  ["8-5-4", {
    hash: "f0102ad9047b9e28af46b69531448308c85c38c1fec49c7be809e20943b55f88",
    pairs: [
      ["Entregas principais", "Define os principais resultados que o projeto deve produzir."],
      ["Premissas, restrições e riscos iniciais", "Mostra condições, limites e incertezas que influenciam o planejamento."],
      ["Problema ou oportunidade", "Explica por que o projeto deve existir e qual situação precisa ser resolvida ou explorada."],
      ["Objetivos e benefícios esperados", "Conecta o projeto ao valor que a organização pretende alcançar."]
    ]
  }]
]);
const hotAreaOverrides = new Map([
  ["5-12-3", {
    sourceHash: "37d3e2f740461c6230520710e4fa740b3f6b1b1060f4dddd673f00e739cf9e6c",
    sourceImage: "3.png",
    sourceImageHash: "1868fcc69e083a8a3e6285a9253273e0e94a7d9b9c7016b865bead6f76d77be8",
    answerImage: "Gabarito - 5.12.png",
    answerImageHash: "7df8956185a5a3bf72b8c8013c79103262a2ee2a17127ca82810c8f1d5e1446b",
    answer: "stage-2",
    visual: {
      kind: "tuckman-curve",
      title: "Curva de eficácia da equipe ao longo do tempo",
      xLabel: "Tempo",
      yLabel: "Eficácia da equipe",
      zones: [
        { id: "stage-1", label: "Primeira etapa", shortLabel: "1" },
        { id: "stage-2", label: "Segunda etapa", shortLabel: "2" },
        { id: "stage-3", label: "Terceira etapa", shortLabel: "3" },
        { id: "stage-4", label: "Quarta etapa", shortLabel: "4" },
        { id: "stage-5", label: "Etapa final", shortLabel: "5" }
      ]
    }
  }],
  ["5-13-7", {
    sourceHash: "682982be60648d7d1da8c1957531e730422eec05d0ab1db04d23a49b0bee5769",
    sourceImage: "7.png",
    sourceImageHash: "ea2e753bf7817f8b20712c8a9a36ac5ab5c1cf1465d4735560910c6e776678a0",
    answerImage: "Gabarito - 5.13.png",
    answerImageHash: "66bbf11100c0b15368934264943f37097ed813aa08738502ef99a15eec606cf5",
    answer: "B",
    visual: {
      kind: "conflict-matrix",
      title: "Matriz de abordagem de conflitos",
      xLabel: "Satisfazer as preocupações da equipe",
      yLabel: "Satisfazer suas próprias preocupações",
      zones: [
        { id: "A", label: "Área A", shortLabel: "A", position: "top-left" },
        { id: "B", label: "Área B", shortLabel: "B", position: "top-right" },
        { id: "C", label: "Área C", shortLabel: "C", position: "center" },
        { id: "D", label: "Área D", shortLabel: "D", position: "bottom-left" },
        { id: "E", label: "Área E", shortLabel: "E", position: "bottom-right" }
      ]
    }
  }],
  ["7-7-3", {
    sourceHash: "9217fdfba9af11241ad03c0031493d046d209f5b2f00a04008e1065fabd35882",
    sourceImage: "3.png",
    sourceImageHash: "859d030f68454f6f3fce81c8ecc68249e24f16a517d3b1096c07d81aea317184",
    answerImage: "Gabarito - 7.7.png",
    answerImageHash: "f0222952b19523a9ef97feab1d662d5004c5361ed1e32f1c40c2d8ca5758b271",
    answer: "high-high",
    visual: {
      kind: "power-interest",
      title: "Matriz de poder e interesse",
      xLabel: "Interesse: baixo para alto",
      yLabel: "Poder: baixo para alto",
      zones: [
        { id: "high-low", label: "Alto poder e baixo interesse", shortLabel: "Alto / Baixo", position: "top-left" },
        { id: "high-high", label: "Alto poder e alto interesse", shortLabel: "Alto / Alto", position: "top-right" },
        { id: "low-low", label: "Baixo poder e baixo interesse", shortLabel: "Baixo / Baixo", position: "bottom-left" },
        { id: "low-high", label: "Baixo poder e alto interesse", shortLabel: "Baixo / Alto", position: "bottom-right" }
      ]
    }
  }],
  ["7-14-5", {
    sourceHash: "51984d97a78c209d5df051fce05b537703105e2e921a5f9c770711892b40e874",
    sourceImage: "5.png",
    sourceImageHash: "d2f2e8495264d3a105e950f35fe2eb78883a18d3d11b5428f78dc7fa0d595da9",
    answerImage: "Gabarito - 7.14.png",
    answerImageHash: "320a054b8ea9b04d41576e292200ed754a3e77d5c4efa65ca5d28645ba698057",
    answer: "C",
    visual: {
      kind: "power-interest",
      title: "Matriz de poder e interesse",
      xLabel: "Interesse: baixo para alto",
      yLabel: "Poder: baixo para alto",
      zones: [
        { id: "A", label: "Quadrante A", shortLabel: "A", position: "top-left" },
        { id: "B", label: "Quadrante B", shortLabel: "B", position: "top-right" },
        { id: "C", label: "Quadrante C", shortLabel: "C", position: "bottom-left" },
        { id: "D", label: "Quadrante D", shortLabel: "D", position: "bottom-right" }
      ]
    }
  }]
]);
const supportOverrides = new Map([
  ["7-2-10", {
    sourceImage: "10.png",
    sourceImageHash: "316ade48e872035c8f16b12b814cfa3d43db5bb1e2c13b72ce749de64e304edd",
    prompt: "O gerente de um projeto e sua equipe estão desenvolvendo o plano de engajamento das partes interessadas. Um membro da equipe do projeto criou a matriz de avaliação do engajamento das partes interessadas abaixo. Qual é o elemento mais importante a ser incluído no plano de engajamento das partes interessadas?",
    support: {
      type: "table",
      caption: "Matriz de avaliação do nível de engajamento das partes interessadas",
      columns: ["Parte interessada", "Desinformado", "Resistente", "Neutro", "Apoiador", "Líder"],
      rows: [["Pessoa A", "A", "", "D", "", ""], ["Pessoa B", "", "", "D", "A", ""], ["Pessoa C", "", "", "", "A D", ""], ["Pessoa D", "", "A", "", "", "D"]],
      note: "A: Atual · D: Desejado"
    }
  }],
  ["7-7-11", {
    sourceImage: "11.png",
    sourceImageHash: "1a5d93af6bfa54f52ea0ba159caa924a843db15408858dfc4aaa21a7310afa25",
    prompt: "Um gerente de projeto está criando o registro das partes interessadas. Ele acaba de concluir as classificações e precisa determinar os papéis prováveis. De acordo com a tabela a seguir, qual pessoa tem mais probabilidade de ser o patrocinador do projeto?",
    support: {
      type: "table",
      caption: "Registro das partes interessadas",
      columns: ["Parte interessada", "Interna / Externa ao projeto", "Poder / Interesse", "Direção da influência"],
      rows: [["Pessoa A", "Interna", "Alto / Alto", "Para cima"], ["Pessoa B", "Externa", "Alto / Alto", "Para cima"], ["Pessoa C", "Externa", "Baixo / Alto", "Para baixo"], ["Pessoa D", "Interna", "Baixo / Alto", "Para o lado"]]
    }
  }]
]);
const imageSessionOverrides = new Map([
  ["7-8", {
    hashes: {
      "1.png": "a48d11e77d5ca82c820aa843b085e4583371566bfb22d4957dd4706498a2a541",
      "2.png": "9500ff1ace29a9c60907640d086baf3c47f85a298eb8dda1c80b3e250f230eaa",
      "3.png": "2b182803061f2b5e90bcdf48039108781e6f905cfb0f27df62e236856fda4c87",
      "4.png": "5d168b7c457c73787926fc4759e845db8453ac20cc4b713b3040f927c21ac4fc",
      "5.png": "3fc9816c76ba7b2352dc584e6083a53607ed9b00c2ccb6c5c043acc9c6ef1d79",
      "6.png": "ff33aab7daba0d38c90d3d48e3fd065264c1b5fca3a8d668bfc17800369f0941",
      "7.png": "53d36596632b70b92bebbd527654bd00664972a191fc1221405e38a1759b83a5",
      "8.png": "0925ee824db4b2b55a561f92355a89140312c050d489c58ad630f54869e1b6ed",
      "9.png": "f57af475bd09b4fc8a00a6b5420663d59ff2c3df7b3b7cfa6335cee0191606c9",
      "10.png": "b27a13567de4fae65a1666fb5c8d5022edc471af76aa69b43a5c5ef387e0b50d",
      "11.png": "7cdaa81f1bbab722cc88cb24565954b3d4a17f15c1e3f9f04092841b6a9951ea",
      "12.png": "bdb7123f0ec67ac51fde0daa642a02ea530bea87cdaf1423ec7b7673ec69e55d",
      "13.png": "ad5616dd671a1981be811b179ce17f76e50a4934b316d2e026a3b58b2b423801",
      "Gabarito - 7.8.png": "3e19433c2ab9be9a7e4e25046a2b6373fb43bb7fdbaa3db7958484eab6ebdf0e"
    },
    questions: [
      {
        number: 1,
        question: "CASO DE ESTUDO — Implantação de ERP em múltiplas unidades\n\nUm gerente de projeto está implantando um ERP em uma grande empresa de fabricação de equipamentos de ar-condicionado. A organização possui oito unidades em cinco estados, com diferenças relevantes de processos, maturidade digital, disponibilidade de equipes locais e práticas operacionais. A verba do projeto já foi aprovada, houve investimento relevante em treinamento inicial e a alta administração espera ganhos de produtividade, redução de custos e maior padronização das informações.\n\nO gerente de projeto tem experiência em implantações semelhantes, e a organização já selecionou processos e formulários padronizados para orientar o projeto. No entanto, durante as primeiras conversas, alguns gerentes regionais demonstram preocupação com impactos sobre rotinas locais, perda temporária de produtividade e mudanças nos papéis das equipes administrativas. A equipe de tecnologia acredita que a implantação pode seguir um roteiro padrão, enquanto a operação entende que cada unidade precisará de preparação específica.\n\nO patrocinador deseja acelerar a implantação para capturar benefícios ainda neste ano fiscal. A equipe do projeto planeja usar uma abordagem híbrida: os marcos principais, integrações e migração de dados serão controlados de forma mais preditiva, enquanto treinamento, ajustes operacionais e feedback dos usuários-chave serão conduzidos em ondas por unidade.\n\nO gerente do projeto precisa reduzir problemas de adoção, alinhar expectativas entre unidades, preparar o plano integrado de implantação e garantir que os benefícios esperados sejam acompanhados após a entrada em operação.\n\nO que o gerente de projeto deve fazer primeiro para reduzir a chance de problemas durante a implantação?",
        options: [
          "Identificar e analisar partes interessadas importantes nas várias unidades.",
          "Obter conhecimento técnico sobre os equipamentos de ar-condicionado produzidos.",
          "Solicitar novo apoio formal da alta administração antes de iniciar o planejamento.",
          "Utilizar os formulários padronizados já selecionados pela organização."
        ],
        answer: "A"
      },
      {
        number: 2,
        question: "Um projeto está atrasado devido a uma greve do sindicato dos trabalhadores. O sindicato afirma que deveria ter sido chamado a opinar no projeto e que seus interesses foram ignorados. O que o gerente de projeto poderia ter feito para evitar essa situação?",
        options: [
          "Identificar adequadamente os riscos.",
          "Planejar adequadamente as comunicações do projeto.",
          "Identificar e analisar adequadamente as partes interessadas.",
          "Solicitar envolvimento da alta gerência no momento apropriado."
        ],
        answer: "C"
      },
      {
        number: 3,
        type: "image_hotspot",
        question: "Em um projeto preditivo, o gerente apresenta a estrutura genérica do ciclo de vida do projeto. Ele explica que, ao longo do projeto, a capacidade das partes interessadas influenciarem as características finais do produto tende a mudar. Em que momento essa capacidade normalmente é menor? Clique na área adequada.",
        answer: "phase-4",
        sourceFiles: ["3.png"],
        visual: {
          kind: "lifecycle-curve",
          title: "Capacidade de influência ao longo do ciclo de vida",
          xLabel: "Tempo",
          yLabel: "Influência das partes interessadas",
          zones: [
            { id: "phase-1", label: "Primeiro trecho", shortLabel: "1" },
            { id: "phase-2", label: "Segundo trecho", shortLabel: "2" },
            { id: "phase-3", label: "Terceiro trecho", shortLabel: "3" },
            { id: "phase-4", label: "Trecho final", shortLabel: "4" }
          ]
        },
        audit: {
          recoveredFrom: ["3.png", "Gabarito - 7.8.png"],
          confidence: "high",
          reviewRequired: false
        }
      },
      {
        number: 4,
        question: "Um gerente de projetos está conduzindo um projeto na fronteira com uma reserva indígena. Ele sabe que atender requisitos, expectativas e preocupações da comunidade local, da organização e de outras partes interessadas será essencial para evitar problemas de comunicação e aceitação. O que o gerente de projeto deve fazer?",
        options: [
          "Mostrar o plano de gerenciamento do projeto à comunidade para que ela não cause problemas posteriores.",
          "Reportar o desempenho do projeto à medida que o projeto progredir.",
          "Realizar reuniões para entender necessidades, gerenciar expectativas e resolver questões com a comunidade indígena.",
          "Controlar o processo e se mobilizar apenas quando a comunidade causar interferência."
        ],
        answer: "C"
      },
      {
        number: 5,
        question: "O gerente de um projeto identificou algumas partes interessadas muito entusiasmadas com o projeto. Ele quer documentar seus interesses, expectativas, influência provável e possíveis contribuições para o sucesso do projeto. O que o gerente de projeto deve atualizar?",
        options: ["Plano de gerenciamento do projeto.", "Plano de gerenciamento das comunicações.", "Registro das partes interessadas.", "Termo de abertura."],
        answer: "C"
      },
      {
        number: 6,
        question: "Em um novo projeto, o gerente está contratando externamente alguns insumos básicos de um novo fornecedor. Se esses insumos atrasarem, o atraso impactará o projeto como um todo. O gerente quer estar preparado para acompanhar esse fornecedor e garantir interação apropriada para apoiar os interesses do projeto. Onde essa informação deve ser registrada?",
        options: ["Registro das partes interessadas.", "Análise das partes interessadas.", "Plano de gerenciamento das aquisições.", "Documentos de licitação."],
        answer: "A"
      },
      {
        number: 7,
        question: "Um gerente de projeto está identificando partes interessadas para uma iniciativa estratégica. A diretoria informa que uma das partes interessadas tem alto poder de influência e já conseguiu interromper outro projeto antes do planejamento detalhado. O que o gerente de projeto deve fazer em relação a essa parte interessada?",
        options: [
          "Limitar o acesso às informações do projeto para reduzir a possibilidade de interferência.",
          "Dar acesso privilegiado a todas as informações do projeto, independentemente da necessidade de informação.",
          "Envolver a parte interessada desde o início, analisar suas expectativas, adaptar a comunicação e gerenciar seu engajamento de perto.",
          "Solicitar ao patrocinador que remova essa parte interessada do projeto para proteger a equipe."
        ],
        answer: "C"
      },
      {
        number: 8,
        question: "Um grande projeto envolve unidades de negócio em diferentes regiões, fornecedores externos e áreas internas com interesses distintos. Dois novos membros entram na equipe e precisam compreender rapidamente quem influencia o projeto, quais são as expectativas relevantes e como interagir com as principais partes interessadas. O que o gerente do projeto deve fazer primeiro?",
        options: [
          "Pedir que os novos membros registrem todas as questões que encontrarem no registro de questões.",
          "Revisar com os novos membros o registro das partes interessadas e a estratégia de engajamento associada.",
          "Agendar imediatamente uma reunião com todos os novos membros e todas as partes interessadas do projeto.",
          "Enviar uma solicitação de mudança para atualizar o plano de engajamento das partes interessadas."
        ],
        answer: "B"
      },
      {
        number: 9,
        question: "Em um projeto híbrido, uma parte interessada importante solicita mudanças significativas no escopo após revisar um incremento entregue. A solicitação pode aumentar o valor do produto, mas também pode afetar prazo, custo e compromissos assumidos com outras áreas. Qual é a melhor abordagem do gerente do projeto na negociação?",
        options: [
          "Rejeitar a solicitação imediatamente para proteger a linha de base e evitar impacto no cronograma.",
          "Escutar ativamente a parte interessada, entender o valor esperado e avaliar alternativas com a equipe antes de decidir.",
          "Aceitar todas as mudanças solicitadas, pois feedback das partes interessadas deve prevalecer em projetos híbridos.",
          "Transferir a negociação ao patrocinador e evitar envolvimento direto para preservar a neutralidade do gerente do projeto."
        ],
        answer: "B"
      },
      {
        number: 10,
        question: "Uma equipe experiente está desenvolvendo um sistema de controle de cargas para uma transportadora. Após uma demonstração para partes interessadas, um representante informa que um usuário operacional importante não está satisfeito, pois o fluxo entregue não atende às suas necessidades. Esse usuário não havia participado das sessões anteriores de levantamento e validação. Qual é a causa raiz mais provável do problema?",
        options: [
          "Os resultados não atendem aos requisitos porque a equipe técnica não possui experiência suficiente.",
          "A parte interessada está fazendo solicitações irrealistas depois de ver o produto funcionando.",
          "O backlog do produto não foi priorizado corretamente pelo dono do produto.",
          "Algumas partes interessadas relevantes não foram identificadas ou analisadas adequadamente."
        ],
        answer: "D"
      },
      {
        number: 11,
        question: "Um projeto possui partes interessadas de marketing, engenharia e tecnologia da informação. Durante o monitoramento do engajamento, o gerente de projetos percebe que o departamento de marketing, antes apoiador, passou a demonstrar postura neutra. Ao investigar, descobre que as comunicações do projeto são muito técnicas e que isso reduziu o interesse e a participação desse grupo. O que o gerente de projetos deve fazer a seguir?",
        options: [
          "Avaliar os estilos e necessidades de comunicação das partes interessadas de marketing.",
          "Fornecer treinamento técnico para o departamento de marketing antes de continuar as comunicações.",
          "Atualizar imediatamente o plano de comunicação com mensagens mais técnicas e detalhadas.",
          "Registrar que o marketing mudou de apoiador para neutro e continuar usando o mesmo formato de comunicação."
        ],
        answer: "A"
      },
      {
        number: 12,
        question: "Um projeto de mudança em produto está tecnicamente dentro do planejado. Um líder regional de operações informa que a mudança interromperá um processo local de suporte ao cliente que não foi discutido nas oficinas anteriores. A equipe do projeto entende que a preocupação chegou tarde, pois os requisitos já foram aprovados.\n\nO que o gerente do projeto deve fazer em seguida?",
        options: [
          "Avaliar o impacto operacional com o grupo afetado antes de decidir a resposta.",
          "Manter os requisitos aprovados e tratar a preocupação na próxima fase.",
          "Solicitar ao patrocinador que reforce o apoio ao desenho aprovado.",
          "Registrar a preocupação nas lições aprendidas e prosseguir com a entrega."
        ],
        answer: "A"
      },
      {
        number: 13,
        question: "O projeto de uma plataforma marítima de pesca no litoral está sendo executado. A organização nunca realizou um projeto como esse e as lições aprendidas durante o projeto estão sendo incorporadas ao repositório de conhecimento organizacional. Quando essas lições aprendidas provavelmente serão aplicadas?",
        options: ["No final do projeto ou fase atual", "Continuamente, durante o projeto atual", "Em projetos ou fases futuras", "Durante o projeto atual, porém no início de uma nova fase"],
        answer: "C"
      }
    ]
  }],
  ["8-9", {
    hashes: {
      "1.png": "fe4e00a8a30cf64d2650cbcd7d52da49c8764d4f2f03907ebe872f8642c1b592",
      "2.png": "6b3a0b0a38eba8bf1cc74e134d396d5be2768669c0d684cfe4761c9dbf6510ab",
      "3.png": "22908f3fca9002efbff52322ae4c7b809c9c04082efb7fdb42c53ccfc551ac30",
      "Gabarito - 8.9.png": "5c9a5c649b923afd1723bb7a13e6712520d2574e75e9f2e24d0f1e8129ef01f6"
    },
    questions: [
      {
        number: 1,
        question: "Ao preparar o plano, a equipe identifica dependências entre obra, licenças, fornecedores, sistemas de ponto de venda, treinamento e comunicação de lançamento. Cada frente possui seu próprio cronograma, mas algumas entregas dependem de aprovações e liberações de outras áreas.\n\nQual abordagem de planejamento é mais adequada?",
        options: [
          "Permitir que cada frente execute seu cronograma e reporte progresso separadamente.",
          "Priorizar a comunicação de lançamento para preservar a data anunciada ao público.",
          "Aguardar a conclusão da obra para detalhar treinamento, sistemas e fornecedores.",
          "Criar um plano integrado com dependências, responsáveis, marcos e critérios de prontidão."
        ],
        answer: "D"
      },
      {
        number: 2,
        question: "Um projeto desenvolverá um dispositivo médico conectado. A submissão regulatória exige evidências, datas e responsáveis definidos, enquanto o aplicativo de apoio ao usuário ainda depende de feedback de profissionais de saúde. O PMO quer aplicar o mesmo planejamento preditivo a todo o trabalho, e a equipe digital defende trabalhar sem controles formais.\n\nQual decisão é mais adequada no planejamento?",
        options: [
          "Aplicar planejamento preditivo completo a todo o trabalho para manter a governança uniforme.",
          "Definir um plano integrado híbrido, com controles para a trilha regulatória e ciclos adaptativos para o aplicativo.",
          "Permitir que cada frente escolha sua própria cadência e reporte resultados no final do projeto.",
          "Adiar o planejamento do aplicativo até que a submissão regulatória esteja concluída."
        ],
        answer: "B"
      },
      {
        number: 3,
        question: "Um projeto de desenvolvimento de um sistema operacional para equipamentos comerciais terá requisitos que serão detalhados ao longo do trabalho. Algumas funcionalidades estão claras para a próxima liberação, mas outras dependem de feedback do mercado e de decisões técnicas futuras. Como o gerente de projeto deve conduzir o planejamento?",
        options: [
          "Aguardar até que todas as informações estejam disponíveis para só então iniciar o planejamento detalhado.",
          "Aplicar planejamento em ondas sucessivas, detalhando o trabalho próximo e mantendo o trabalho futuro em nível mais alto até que haja informação suficiente.",
          "Planejar todas as fases sucessivas com o mesmo nível de detalhe, evitando revisões posteriores do plano.",
          "Refazer integralmente o planejamento a cada fase, descartando os resultados das fases anteriores."
        ],
        answer: "B"
      }
    ]
  }],
  ["8-12", {
    hashes: {
      "1.png": "65bac8872e7ef760a2b5f22125fde2e9d340a8a1cc8e06bb8d3307be0045b5ef",
      "2.png": "a3f256f20045d3d3095b65a011decd487c39df9f9602fe3f5390f3ac376c0d32",
      "3.png": "3ae93d9e8eeaed09c32cf73d8e2d03a4268b550ea9b228bcb1f62311b6dc6628",
      "caso-1.png": "317c3655da3e22360683a7ee32941691796d94f91ac5a520de1f941709853050",
      "Gabarito - 8.12.png": "77deec1a6cf0277204dda3573f8aec61d6ab2ed4f178ac8938270ad9bc638346"
    },
    questions: [
      {
        number: 1,
        sourceFiles: ["caso-1.png", "1.png"],
        question: "CASO DE ESTUDO - Renovação Automática de Medicamentos\n\nUma rede nacional de farmácias aprovou uma iniciativa para lançar um serviço digital de renovação automática de medicamentos de uso contínuo. O objetivo de negócio é aumentar a retenção de clientes, reduzir filas nas lojas físicas e melhorar a conveniência para pacientes recorrentes. A diretoria estabeleceu uma meta inicial de aumentar em 8% a recompra de medicamentos recorrentes no primeiro ano e reduzir em 15% o volume de atendimentos presenciais relacionados a renovações simples.\n\nO projeto tem orçamento inicial aprovado de R$ 1.200.000 e prazo de oito meses para o lançamento nacional. O patrocinador, porém, pediu que um piloto em duas capitais seja realizado em quatro meses para testar aceitação do serviço. A equipe de produto propõe começar com uma versão mínima que permita cadastro do cliente, lembrete de renovação e retirada programada na loja. A área comercial quer incluir entrega em domicílio desde o primeiro piloto, pois acredita que isso aumentaria a atratividade da campanha. A área de operações alerta que a entrega em domicílio depende de contratos logísticos ainda não negociados.\n\nHá também restrições regulatórias e de privacidade. A área jurídica informa que o serviço deve tratar dados pessoais e dados sensíveis de saúde, exigindo consentimento adequado, rastreabilidade das autorizações e controles de acesso. A equipe de tecnologia afirma que os sistemas atuais de cadastro e estoque podem ser integrados, mas há incerteza sobre a qualidade dos dados de clientes antigos. O PMO solicitou um plano integrado que conecte o piloto, as integrações técnicas, a campanha comercial, a validação regulatória e a preparação das lojas participantes.\n\nDurante a iniciação, algumas áreas interpretam o sucesso de forma diferente. A diretoria enfatiza retenção e redução de filas; comercial enfatiza adesão ao serviço; operações enfatiza redução de retrabalho nas lojas; jurídico enfatiza conformidade e privacidade. O gerente do projeto precisa estruturar o trabalho sem perder a meta de aprendizado rápido do piloto.\n\nQual abordagem de planejamento é mais adequada para o projeto citado no caso?",
        options: [
          "Planejar primeiro toda a solução nacional e iniciar o piloto somente após a conclusão de todos os contratos logísticos.",
          "Criar um plano integrado híbrido, conectando piloto, integrações, validação regulatória, campanha e preparação das lojas.",
          "Permitir que cada área mantenha seu próprio plano, desde que envie relatórios semanais ao PMO.",
          "Conduzir todo o trabalho de forma adaptativa, deixando privacidade e contratos para decisões próximas ao lançamento."
        ],
        answer: "B"
      },
      {
        number: 2,
        question: "Um projeto híbrido para modernizar uma plataforma de serviços possui três frentes: migração de dados, desenvolvimento de novas funcionalidades e adequação regulatória. Cada frente preparou seu próprio plano, mas surgiram conflitos entre datas, critérios de aceite e dependências técnicas. A equipe regulatória alerta que algumas evidências precisam estar prontas antes dos testes integrados.\n\nQual ação é mais adequada para o gerente do projeto?",
        options: [
          "Consolidar os planos com as equipes, alinhando dependências, marcos e critérios de aceite.",
          "Manter os planos separados, desde que cada frente reporte seu progresso semanalmente.",
          "Aplicar a mesma cadência adaptativa a todas as frentes para simplificar o acompanhamento.",
          "Aguardar a conclusão da migração de dados antes de planejar testes e evidências regulatórias."
        ],
        answer: "A"
      },
      {
        number: 3,
        question: "Um gerente de projeto está liderando um projeto de desenvolvimento de software usando uma abordagem híbrida. Durante a execução, o patrocinador é substituído. Ao ser informado de que as entregas estão sendo produzidas em uma abordagem híbrida, o novo patrocinador pede evidências formais dessa decisão. Como o gerente de projeto deve atender à solicitação?",
        options: [
          "Explicar verbalmente ao novo patrocinador o que é uma abordagem híbrida e por que ela foi escolhida.",
          "Orientar o patrocinador a falar diretamente com a equipe para entender como o produto está sendo desenvolvido.",
          "Apresentar somente o termo de abertura do projeto, pois ele autoriza formalmente a iniciativa.",
          "Apresentar o plano de gerenciamento do projeto e os artefatos que descrevem a abordagem de desenvolvimento e entrega."
        ],
        answer: "D"
      }
    ]
  }]
]);

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeBlock(value) {
  return value.replace(/\r\n?/g, "\n").trim();
}

function normalizeFingerprintText(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

function questionFingerprint(question) {
  return JSON.stringify({
    type: question.type,
    question: normalizeFingerprintText(question.question),
    options: (question.options || []).map((option) => [option.id, normalizeFingerprintText(option.text)]),
    pairs: (question.pairs || []).map((pair) => [normalizeFingerprintText(pair.left), normalizeFingerprintText(pair.right)]),
    answer: question.answer || []
  });
}

function parseAnswerKey(contents, areaNumber, sessionNumber) {
  const answers = new Map();

  for (const match of contents.matchAll(/^(\d+)\s*-\s*(.+?)\s*$/gm)) {
    const number = Number(match[1]);
    const rawAnswer = match[2].trim();

    if (/^[A-F](?:\s*,\s*[A-F])*$/i.test(rawAnswer)) {
      answers.set(number, {
        type: "options",
        value: rawAnswer.split(",").map((answer) => answer.trim().toUpperCase())
      });
    } else if (/^Combine os Itens$/i.test(rawAnswer)) {
      answers.set(number, { type: "matching", value: ["Combine os Itens"] });
    } else if (/^Hot Area$/i.test(rawAnswer)) {
      answers.set(number, { type: "hot-area", value: ["Hot Area"] });
    } else {
      throw new Error(`Área ${areaNumber}, sessão ${sessionNumber}, questão ${number}: gabarito não reconhecido: ${rawAnswer}.`);
    }
  }

  if (answers.size === 0) throw new Error(`Área ${areaNumber}, sessão ${sessionNumber}: gabarito não encontrado.`);
  return answers;
}

function parseMatching(block, areaNumber, sessionNumber, questionNumber) {
  const key = `${areaNumber}-${sessionNumber}-${questionNumber}`;
  const sections = block.split(/\n\s*\n/).map((section) => section.trim()).filter(Boolean);
  const override = matchingOverrides.get(key);

  if (override) {
    if (hash(block) !== override.hash) throw new Error(`Área ${areaNumber}, sessão ${sessionNumber}, questão ${questionNumber}: fonte de associação alterada.`);
    return {
      question: sections.slice(0, -1).join("\n\n").trim(),
      pairs: override.pairs.map(([left, right]) => ({ left, right }))
    };
  }

  const lines = block.split("\n");
  let pairStart = lines.length;
  while (pairStart > 0 && /^.+:\s*.+$/.test(lines[pairStart - 1].trim())) pairStart -= 1;
  const pairLines = lines.slice(pairStart).map((line) => line.trim()).filter(Boolean);
  const question = lines.slice(0, pairStart).join("\n").trim();

  let pairs;
  if (pairLines.length >= 4 && pairLines.every((line, index) => index % 2 === 0 ? /^Abordagem:\s*.+/i.test(line) : /^Objetivo:\s*.+/i.test(line))) {
    pairs = [];
    for (let index = 0; index < pairLines.length; index += 2) {
      pairs.push({
        left: pairLines[index].replace(/^Abordagem:\s*/i, "").trim(),
        right: pairLines[index + 1].replace(/^Objetivo:\s*/i, "").trim()
      });
    }
  } else if (pairLines.length >= 2 && pairLines.every((line) => line.includes(":"))) {
    pairs = pairLines.map((line) => {
      const separator = line.indexOf(":");
      return { left: line.slice(0, separator).trim(), right: line.slice(separator + 1).trim() };
    });
  } else {
    throw new Error(`Área ${areaNumber}, sessão ${sessionNumber}, questão ${questionNumber}: associações sem estrutura reconhecida.`);
  }

  if (!question || pairs.length < 2 || pairs.some((pair) => !pair.left || !pair.right)) {
    throw new Error(`Área ${areaNumber}, sessão ${sessionNumber}, questão ${questionNumber}: associação incompleta.`);
  }
  return { question, pairs };
}

function baseQuestion(area, sessionNumber, number, sourceFileName) {
  return {
    number,
    area: area.folder,
    domain: "",
    reference: `PMP - BOOK 8/${area.folder}/${sessionNumber}/${sourceFileName}`,
    explanation: "",
    id: `${area.prefix}-s${sessionNumber}-q${number}`,
    source: `${area.folder}/${sessionNumber}`,
    title: `Sessão ${sessionNumber}`,
    session: sessionNumber
  };
}

function applySupportOverride(question, sourceKey) {
  const override = supportOverrides.get(sourceKey);
  if (!override) return question;
  return {
    ...question,
    question: override.prompt,
    support: override.support,
    audit: {
      recoveredFrom: [override.sourceImage],
      sourceImageHash: override.sourceImageHash,
      confidence: "high",
      reviewRequired: false
    }
  };
}

function parseQuestions(contents, area, sessionNumber, sourceFileName) {
  const answerKeyIndex = contents.search(/^GABARITO\s*$/im);
  if (answerKeyIndex === -1) throw new Error(`Área ${area.number}, sessão ${sessionNumber}: marcador GABARITO ausente.`);

  const questionSource = contents.slice(0, answerKeyIndex);
  const answerSource = contents.slice(answerKeyIndex);
  const answerKey = parseAnswerKey(answerSource, area.number, sessionNumber);
  const headers = [...questionSource.matchAll(/^Questão\s+(\d+)\s+de\s+(\d+)\s*$/gim)];

  if (headers.length === 0) throw new Error(`Área ${area.number}, sessão ${sessionNumber}: nenhuma questão encontrada.`);

  const declaredTotals = new Set(headers.map((header) => Number(header[2])));
  const declaredTotal = Number(headers[0][2]);
  const expectedNumbers = Array.from({ length: declaredTotal }, (_, index) => index + 1);
  const actualNumbers = headers.map((header) => Number(header[1]));

  if (declaredTotals.size !== 1 || headers.length !== declaredTotal || JSON.stringify(actualNumbers) !== JSON.stringify(expectedNumbers)) {
    throw new Error(`Área ${area.number}, sessão ${sessionNumber}: numeração inválida; declarado ${declaredTotal}, encontrado ${actualNumbers.join(", ")}.`);
  }
  if (answerKey.size !== declaredTotal) {
    throw new Error(`Área ${area.number}, sessão ${sessionNumber}: esperado ${declaredTotal}, encontrado ${answerKey.size} respostas.`);
  }

  return headers.map((header, index) => {
    const number = Number(header[1]);
    const nextHeader = headers[index + 1];
    const blockStart = header.index + header[0].length;
    const blockEnd = nextHeader?.index ?? questionSource.length;
    const block = normalizeBlock(questionSource.slice(blockStart, blockEnd));
    const answerEntry = answerKey.get(number);
    const sourceKey = `${area.number}-${sessionNumber}-${number}`;

    if (!answerEntry) throw new Error(`Área ${area.number}, sessão ${sessionNumber}, questão ${number}: resposta ausente.`);
    if (answerEntry.type === "hot-area") {
      const override = hotAreaOverrides.get(sourceKey);
      if (!override || override.sourceHash !== hash(block)) {
        throw new Error(`Área ${area.number}, sessão ${sessionNumber}, questão ${number}: Hot Area inesperada ou alterada.`);
      }
      return {
        ...baseQuestion(area, sessionNumber, number, sourceFileName),
        type: "image_hotspot",
        question: block,
        options: [],
        pairs: [],
        answer: [override.answer],
        required: 1,
        visual: override.visual,
        audit: {
          recoveredFrom: [override.sourceImage, override.answerImage],
          sourceImageHash: override.sourceImageHash,
          answerImageHash: override.answerImageHash,
          confidence: "high",
          reviewRequired: false
        }
      };
    }

    let type;
    let question;
    let options = [];
    let pairs = [];
    const answer = answerEntry.value;
    let required;

    if (answerEntry.type === "matching") {
      const matching = parseMatching(block, area.number, sessionNumber, number);
      type = "matching";
      question = matching.question;
      pairs = matching.pairs;
      required = pairs.length;
    } else {
      const optionMarkers = [...block.matchAll(/^([A-F])\.\s+(.+)$/gm)];
      if (optionMarkers.length < 2) {
        throw new Error(`Área ${area.number}, sessão ${sessionNumber}, questão ${number}: alternativas insuficientes.`);
      }

      question = block.slice(0, optionMarkers[0].index).trim();
      options = optionMarkers.map((marker, optionIndex) => {
        const optionEnd = optionMarkers[optionIndex + 1]?.index ?? block.length;
        const firstLineEnd = marker.index + marker[0].length;
        const continuation = block.slice(firstLineEnd, optionEnd).trim();
        return { id: marker[1], text: [marker[2].trim(), continuation].filter(Boolean).join("\n") };
      });

      const optionIds = new Set(options.map((option) => option.id));
      if (!question) throw new Error(`Área ${area.number}, sessão ${sessionNumber}, questão ${number}: enunciado vazio.`);
      if (!answer.every((item) => optionIds.has(item))) {
        throw new Error(`Área ${area.number}, sessão ${sessionNumber}, questão ${number}: resposta fora das alternativas.`);
      }

      type = answer.length > 1 ? "multiple" : "single";
      required = answer.length;
    }

    return applySupportOverride({
      number,
      type,
      question,
      options,
      pairs,
      answer,
      required,
      area: area.folder,
      domain: "",
      reference: `PMP - BOOK 8/${area.folder}/${sessionNumber}/${sourceFileName}`,
      explanation: "",
      id: `${area.prefix}-s${sessionNumber}-q${number}`,
      source: `${area.folder}/${sessionNumber}`,
      title: `Sessão ${sessionNumber}`,
      session: sessionNumber
    }, sourceKey);
  });
}

async function verifyQuestionAssets(questions, sessionDirectory) {
  for (const question of questions) {
    const files = question.audit?.recoveredFrom || [];
    const hashes = [question.audit?.sourceImageHash, question.audit?.answerImageHash].filter(Boolean);
    for (const [index, expectedHash] of hashes.entries()) {
      const fileName = files[index];
      const actualHash = hash(await readFile(path.join(sessionDirectory, fileName)));
      if (actualHash !== expectedHash) throw new Error(`${question.id}: imagem-fonte ${fileName} foi alterada.`);
    }
  }
}

async function importSession(area, sessionNumber) {
  const sessionDirectory = path.join(sourceRoot, area.folder, String(sessionNumber));
  const sourceFiles = await readdir(sessionDirectory, { withFileTypes: true });
  const imageOverride = imageSessionOverrides.get(`${area.number}-${sessionNumber}`);

  if (imageOverride) {
    for (const [fileName, expectedHash] of Object.entries(imageOverride.hashes)) {
      const actualHash = hash(await readFile(path.join(sessionDirectory, fileName)));
      if (actualHash !== expectedHash) {
        throw new Error(`Área ${area.number}, sessão ${sessionNumber}: imagem-fonte ${fileName} foi alterada.`);
      }
    }

    const answerFileName = Object.keys(imageOverride.hashes).find((fileName) => /^Gabarito/i.test(fileName));
    const questions = imageOverride.questions.map((entry) => {
      const sourceQuestionFiles = entry.sourceFiles || [`${entry.number}.png`];
      const referenceFiles = [...sourceQuestionFiles, answerFileName].filter(Boolean).join("; ");
      return {
        number: entry.number,
        type: entry.type || "single",
        question: entry.question,
        options: (entry.options || []).map((text, index) => ({ id: String.fromCharCode(65 + index), text })),
        pairs: [],
        answer: [entry.answer],
        required: 1,
        visual: entry.visual,
        audit: entry.audit,
        area: area.folder,
        domain: "",
        reference: `PMP - BOOK 8/${area.folder}/${sessionNumber}/${referenceFiles}`,
        explanation: "",
        id: `${area.prefix}-s${sessionNumber}-q${entry.number}`,
        source: `${area.folder}/${sessionNumber}`,
        title: `Sessão ${sessionNumber}`,
        session: sessionNumber
      };
    });

    return {
      id: `${area.prefix}-s${sessionNumber}`,
      number: sessionNumber,
      title: `Sessão ${sessionNumber}`,
      questions,
      available: true,
      note: ""
    };
  }

  const answerFiles = sourceFiles
    .filter((file) => file.isFile() && /^Ga(?:b|nb)arito.*\.txt$/i.test(file.name))
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

  if (answerFiles.length === 0) throw new Error(`Área ${area.number}, sessão ${sessionNumber}: nenhum Gabarito TXT encontrado.`);

  const candidateContents = await Promise.all(answerFiles.map(async (file) => ({
    name: file.name,
    contents: (await readFile(path.join(sessionDirectory, file.name), "utf8")).replace(/\r\n?/g, "\n")
  })));
  if (new Set(candidateContents.map((candidate) => candidate.contents)).size !== 1) {
    throw new Error(`Área ${area.number}, sessão ${sessionNumber}: Gabaritos TXT conflitantes: ${answerFiles.map((file) => file.name).join(", ")}.`);
  }

  const source = candidateContents[0];
  const questions = parseQuestions(source.contents, area, sessionNumber, source.name);
  await verifyQuestionAssets(questions, sessionDirectory);
  return {
    id: `${area.prefix}-s${sessionNumber}`,
    number: sessionNumber,
    title: `Sessão ${sessionNumber}`,
    questions,
    available: true,
    note: ""
  };
}

const context = { window: {} };
vm.runInNewContext(await readFile(questionBankPath, "utf8"), context);
const questionBank = context.window.PREPARAKEY_QUESTIONS;
if (!questionBank?.areas?.[0] || !Array.isArray(questionBank.simulados)) throw new Error("Banco atual inválido.");

const existingAreaOne = questionBank.areas[0];
const existingAreaOneQuestions = new Map(existingAreaOne.sessions.flatMap((session) => session.questions).map((question) => [question.id, question]));
const comparableFields = (question) => ({
  number: question.number,
  type: question.type,
  question: question.question,
  options: question.options || [],
  pairs: question.pairs || [],
  answer: question.answer,
  required: question.required
});

const importedAreas = [];
const skippedDuplicates = [];
const seenFingerprints = new Map();

for (const area of areas) {
  const sessions = [];
  for (const sessionNumber of sessionNumbers) sessions.push(await importSession(area, sessionNumber));

  for (const session of sessions) {
    const activeQuestions = [];
    for (const entry of session.questions) {
      const fingerprint = questionFingerprint(entry);
      if (seenFingerprints.has(fingerprint)) {
        skippedDuplicates.push({ id: entry.id, duplicateOf: seenFingerprints.get(fingerprint) });
        continue;
      }

      let question = entry;
      if (area.number === 1) {
        const existing = existingAreaOneQuestions.get(entry.id);
        if (!existing || JSON.stringify(comparableFields(existing)) !== JSON.stringify(comparableFields(entry))) {
          throw new Error(`A questão existente ${entry.id} diverge da fonte; importação interrompida para preservá-la.`);
        }
        question = existing;
      }

      seenFingerprints.set(fingerprint, question.id);
      activeQuestions.push(question);
    }
    session.questions = activeQuestions;
  }

  importedAreas.push({ id: area.id, title: area.folder, sessions });
}

const activeCounts = importedAreas.map((area) => area.sessions.reduce((total, session) => total + session.questions.length, 0));
if (JSON.stringify(activeCounts) !== JSON.stringify(expectedActiveCounts)) {
  throw new Error(`Totais inesperados após validação: ${activeCounts.join(", ")}. Duplicatas: ${JSON.stringify(skippedDuplicates)}.`);
}

questionBank.areas = importedAreas;
questionBank.missingSessions = [];
questionBank.generatedAt = "2026-09-28";
questionBank.contentSource = "PMP - BOOK 8, áreas 1–8";
questionBank.excludedUnsupported = [];
questionBank.recoveredVisualQuestions = importedAreas.flatMap((area) => area.sessions.flatMap((session) => session.questions.filter((question) => question.visual || question.support).map((question) => question.id)));
questionBank.removedDuplicates = skippedDuplicates;

await writeFile(questionBankPath, `window.PREPARAKEY_QUESTIONS = ${JSON.stringify(questionBank, null, 2)};\n`, "utf8");

const totalQuestions = activeCounts.reduce((total, count) => total + count, 0);
console.log(`Base aplicada no fluxo existente: ${importedAreas.length} áreas, ${importedAreas.length * sessionNumbers.length} sessões e ${totalQuestions} questões compatíveis.`);
console.log(`Duplicatas integrais removidas: ${skippedDuplicates.length}. Questões visuais recuperadas: ${questionBank.recoveredVisualQuestions.length}.`);
