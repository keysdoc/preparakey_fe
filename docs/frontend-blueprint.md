# Blueprint do frontend PreparaKey

## Visão do produto

O PreparaKey é uma PWA estática, local-first, para preparação PMP. A aplicação não possui backend, autenticação remota, banco de dados ou chamadas de API. Perguntas e configuração são distribuídas como JavaScript estático; histórico, preferências e questionário em andamento são persistidos no `localStorage` do dispositivo.

## Arquitetura atual

```text
index.html (entrada)
└── app.html (shell do aplicativo)
    ├── navegação lateral / navegação inferior móvel
    ├── dashboard
    ├── simulados
    ├── áreas de conhecimento
    ├── questionário
    ├── histórico
    └── configurações

js/config.js      configuração pública e nota de aprovação
js/questions.js   banco estático de perguntas
js/app.js         estado, apresentação, regras e navegação
css/styles.css    tokens e estilos compartilhados
sw.js             cache offline e fallback
```

Não há roteador externo. A navegação usa hashes e `history.pushState`, preservando as rotas `#dashboard`, `#simulados`, `#areas`, `#questionario`, `#historico` e `#configuracoes`.

## Inventário de telas

| Tela | Rota | Objetivo | Dados | Ação principal | Estados relevantes |
| --- | --- | --- | --- | --- | --- |
| Acesso | `index.html` | Explicar o armazenamento local e entrar no app | Configuração pública | Acessar o painel | padrão, offline |
| Dashboard | `app.html#dashboard` | Resumir preparação e indicar próximo passo | banco de questões + histórico local | Continuar/começar estudos | sem histórico, em progresso, pronto |
| Simulados | `#simulados` | Executar avaliação consolidada | `DATA.simulados` | Iniciar/refazer simulado | disponível, bloqueado, aprovado |
| Áreas | `#areas` | Escolher área e sessão | `DATA.areas` | Abrir área/iniciar sessão | disponível, bloqueada, aprovada, paginação |
| Questionário | `#questionario` | Responder questões | avaliação escolhida + estado ativo | Avançar | vazio, selecionado, verificado, correto/incorreto, concluído |
| Histórico | `#historico` | Consultar resultados e respostas | `preparakey.history` | Revisar tentativa | vazio, lista, detalhe |
| Configurações | `#configuracoes` | Alterar aparência | `preparakey.theme` | Escolher tema | claro, escuro |
| Offline | `offline.html` | Recuperar navegação sem rede | cache do service worker | Voltar ao app | offline |

## Componentes e responsabilidades

- `app-shell`: estrutura persistente com sidebar, topbar, conteúdo e navegação móvel.
- `study-card`: card reutilizado por áreas, sessões e simulados; contém status e CTA. Na visão de áreas, cinco cards são exibidos inicialmente e o botão semântico `toggleAreasBtn` expande/recolhe os demais sem alterar os dados ou o estado selecionado.
- `quiz-container`: pergunta, metadados, opções, associações, materiais de apoio, hotspots e feedback.
- `support-table`: tabela semântica e rolável somente quando a imagem-fonte contém material de consulta.
- `hotspot-canvas`: diagrama responsivo com zonas acionáveis por toque, mouse ou teclado; não publica capturas da interface antiga.
- `matching-grid`: associação por arrastar/soltar ou por toque em duas etapas, preservando o seletor nativo como alternativa acessível.
- `quiz-flow-actions`: ações naturais abaixo das opções. `Avançar` depende apenas da seleção; `Verificar` é opcional.
- `kpi-card`, `chart-panel`, `insight-list`: indicadores derivados exclusivamente do histórico real.
- `history-item` e `history-detail`: resumo e revisão da tentativa.
- `theme-card`: preferência visual persistida.
- `empty-state`: orientação e CTA quando não há dados.

## Fluxos principais

### Estudo por área

`Dashboard/Áreas → área → sessão desbloqueada → selecionar resposta → avançar ou verificar → finalizar → histórico`.

Uma sessão posterior só é liberada quando todas as anteriores estão aprovadas com a nota configurada. A sessão aprovada pode ser refeita.

### Simulado

`Dashboard/Simulados → simulado desbloqueado → responder → finalizar → histórico`.

O mesmo requisito de aprovação controla a liberação do simulado seguinte. O banco de questões é referenciado, não duplicado.

### Pergunta

`idle → selected → (checked-correct | checked-incorrect, opcional) → next → completed`.

- Sem resposta: `Avançar` e `Verificar` indisponíveis.
- Com resposta: ambos disponíveis imediatamente.
- `Verificar`: mostra feedback e preserva a seleção.
- `Avançar`: funciona com ou sem verificação.

### Retomada

O estado ativo guarda IDs das questões, respostas, verificações, índice e tempo decorrido. Na reentrada, as questões são resolvidas novamente contra a base atual. Uma mudança de `contentVersion` limpa somente dados incompatíveis com o conteúdo.

## Persistência e contratos

| Chave | Conteúdo |
| --- | --- |
| `preparakey.session` | marcador local de entrada |
| `preparakey.contentVersion` | versão da base de perguntas |
| `preparakey.history` | resultados finalizados |
| `preparakey.activeQuiz` | avaliação em andamento |
| `preparakey.theme` | tema claro/escuro |

O frontend não envia esses dados para terceiros. Limpar progresso remove histórico, respostas e avaliação ativa.

## Blueprint de experiência

### Shell compartilhado

- Desktop: sidebar persistente, contexto no topbar e conteúdo com largura de leitura controlada.
- Tablet: sidebar em drawer com backdrop; grids em duas colunas quando houver espaço.
- Mobile/PWA/WebView: navegação inferior para destinos principais, drawer para destinos secundários, safe areas e scroll único no documento.
- Landscape de pouca altura: topbar e espaçamentos reduzidos; nenhuma ação importante usa posicionamento absoluto.

### Hierarquia por tela

1. Contexto e título.
2. Orientação curta.
3. CTA principal e ação secundária.
4. Conteúdo e dados reais.
5. Feedback e estados de recuperação.

### Dados e visualização

- Questões disponíveis: contagem única do banco atual.
- Índice médio: média das tentativas concluídas.
- Último resultado: pontuação da tentativa mais recente.
- Taxa de aprovação: tentativas aprovadas divididas pelo total.
- Desempenho médio: donut baseado na média real.
- Evolução recente: últimas pontuações reais, sem domínios ou valores inferidos.

## Acessibilidade e adaptação

- landmarks, títulos associados, botões nativos e `aria-current` nas navegações;
- link “pular para o conteúdo”, foco visível e fechamento do drawer por `Escape`;
- estados selecionado/correto/incorreto com texto e símbolo, não apenas cor;
- regiões de status para progresso e feedback;
- tabelas com cabeçalhos, legendas e região rolável identificada;
- hotspots com botões nativos, IDs estáveis e retorno textual de seleção/correção;
- alvos de toque mínimos de 48 px;
- suporte a contraste forçado e redução de movimento;
- `100dvh`/`100svh`, `viewport-fit=cover` e `env(safe-area-inset-*)` para PWA/WebView.

## Limites intencionais

- Não há login remoto ou sincronização entre dispositivos.
- Não há gráficos por domínio porque o histórico atual não armazena domínio agregado por tentativa.
- Não há filtros, exportação ou modais: esses fluxos não existem no produto atual e não foram inventados. Tabelas aparecem somente como material didático comprovado pela fonte.
- O alerta nativo de conclusão e a confirmação de limpeza são preservados por fazerem parte do comportamento existente.
