# PreparaKey Frontend

PWA estática em HTML, CSS e JavaScript para simulados de preparação PMP. O projeto não usa framework nem etapa de compilação; o build reúne os arquivos públicos de forma determinística em `dist/`.

## Requisitos

- Node.js 24 LTS, conforme `.nvmrc`.
- npm 10.9.8, conforme `packageManager` em `package.json`.

## Instalação e desenvolvimento

Instale as dependências de forma reproduzível:

```bash
npm ci
```

Para desenvolvimento, sirva a raiz do projeto com qualquer servidor HTTP estático. Exemplo:

```bash
npx --yes serve .
```

O service worker e alguns recursos da PWA não funcionam corretamente quando os arquivos são abertos diretamente com `file://`.

## Qualidade, testes e build

```bash
npm run lint
npm run security
npm run audit:content -- --source "C:\Users\adm\Documents\Screenshots\PMP - BOOK 8"
npm test
npm run validate:workflows
npm run build
```

Todos os gates locais podem ser executados em sequência com:

```bash
npm run check
```

O artefato de produção é gerado em `dist/`. Não há `typecheck` separado porque o projeto usa JavaScript sem TypeScript; a sintaxe e os principais contratos de dados são cobertos pelo lint e pelos testes.

## Importação das áreas de conhecimento

A fonte exclusiva das perguntas é `C:\Users\adm\Documents\Screenshots\PMP - BOOK 8`. O importador usa uma lista explícita das áreas 1–12 e termina em `12. Cronograma, estimativas, capacidade e fluxo`; nenhuma pasta posterior é lida.

Para reaplicar toda a base:

```powershell
npm run import:knowledge -- --source "C:\Users\adm\Documents\Screenshots\PMP - BOOK 8"
```

O importador exige 16 sessões por área, valida numeração, alternativas, associações e gabaritos, e preserva os objetos existentes da primeira área quando correspondem à fonte. Arquivos de gabarito duplicados são aceitos somente quando o conteúdo é idêntico; versões conflitantes interrompem a importação. As sessões 7/8, 8/9, 8/12, 9/3, 9/4 e 9/11 existem apenas em imagens e possuem transcrições explícitas protegidas pelos hashes SHA-256 das imagens e dos respectivos gabaritos.

A base ativa contém doze áreas, 192 sessões e 1.644 questões compatíveis com os componentes existentes (`single`, `multiple`, `matching` e `image_hotspot`). Treze repetições integrais da fonte são removidas, mantendo a primeira ocorrência. Os sete itens `Hot Area` foram recuperados das imagens de questão e de gabarito, protegidos por SHA-256 e reconstruídos como diagramas HTML/CSS acessíveis; as matrizes 7/2/10 e 7/7/11 foram convertidas em tabelas HTML semânticas, e os gráficos/casos visuais das áreas 9 foram recriados como SVG/HTML acessível. Capturas completas, interface antiga e marcações de correção não são publicadas.

A auditoria reproduzível de todas as pastas da fonte, incluindo a correspondência por hash das imagens em `PERUNTAS A PADRONIZAR WEB`, pode ser refeita com:

```powershell
npm run audit:content -- --source "C:\Users\adm\Documents\Screenshots\PMP - BOOK 8"
```

O relatório consolidado está em [`docs/content-audit.md`](docs/content-audit.md), e a tabela linha a linha das questões publicadas está em [`docs/content-audit.csv`](docs/content-audit.csv). A área 13 contém apenas imagens sem TXT/gabarito validável e as áreas 14–22 estão vazias; todas permanecem fora do produto pelo limite explícito em 12.

O simulado existente permanece único e referencia somente as 16 sessões da primeira área, sem copiar perguntas. “Áreas de Conhecimento” reutiliza os cards de área/sessão e o mesmo questionário da aplicação.

O planejamento integrado desta entrega, incluindo escopo, qualidade, riscos, dependências e pendências externas, está em [`docs/planejamento-integrado.md`](docs/planejamento-integrado.md).

O inventário completo de telas, rotas, componentes, estados, persistência, fluxos e decisões responsivas está em [`docs/frontend-blueprint.md`](docs/frontend-blueprint.md). O dashboard usa somente dados efetivamente registrados no histórico: média, último resultado, taxa de aprovação e evolução recente. Nenhuma métrica por domínio é estimada.

## Autenticação e variáveis de ambiente

Esta versão é uma aplicação local estática e não possui backend de autenticação. A tela inicial oferece apenas acesso local ao painel e não deve ser apresentada como uma barreira de segurança.

Não há variáveis de ambiente obrigatórias. Nenhuma senha, token ou chave deve ser incluída no JavaScript, HTML, workflows ou arquivos `.env`. Uma autenticação real deve ser implementada em um backend e integrada por um protocolo apropriado antes de armazenar dados sensíveis.

## CI

O workflow `.github/workflows/ci.yml` roda em todo `push` e `pull_request`. Ele:

1. instala Node.js 24 e usa cache do npm;
2. executa `npm ci` e auditoria de vulnerabilidades;
3. executa lint e verificação de segredos;
4. executa os testes;
5. valida a sintaxe dos workflows;
6. gera o build de produção.

Qualquer falha encerra o job com erro.

Para diagnosticar uma falha, execute primeiro `npm ci` e depois o mesmo comando da etapa indicada no log. Falhas no importador devem ser tratadas na fonte ou nos contratos explícitos; não altere totais ou hashes apenas para contornar a validação. Falhas de cache/build podem ser reproduzidas com `npm run build`, que recria `dist/` do zero.

## Deploy

O workflow `.github/workflows/deploy.yml` publica em GitHub Pages somente quando a variável de repositório `ENABLE_GITHUB_PAGES` é `true` e o workflow `CI` termina com sucesso para um `push` na branch `main`. Pull requests e pushes em outras branches executam apenas CI. O deploy faz checkout exato do commit validado, instala dependências sem cache privilegiado, refaz o build e publica `dist/`.

Não são necessários secrets. O workflow usa apenas o `GITHUB_TOKEN` efêmero com permissões mínimas de Pages e OIDC.

Antes do primeiro deploy, configure o repositório no GitHub em **Settings > Pages > Build and deployment > Source > GitHub Actions** e crie `ENABLE_GITHUB_PAGES=true` em **Settings > Secrets and variables > Actions > Variables**. Depois de configurado, cada CI aprovado em `main` inicia o deploy automaticamente. Para repetir manualmente um deploy, abra a execução concluída do workflow **Deploy** no GitHub Actions e selecione **Re-run jobs**; isso reutiliza um commit cujo CI já passou.

O plano atual da conta não permite GitHub Pages enquanto este repositório for privado. Até que o plano seja alterado, outro provedor seja escolhido ou a visibilidade seja modificada com autorização explícita, mantenha `ENABLE_GITHUB_PAGES` ausente; o job de deploy ficará marcado como ignorado e nenhuma publicação será simulada.

## Publicação

Revise e valide as alterações antes de publicar:

```bash
git add .
git commit -m "ci: configure frontend validation and Pages deploy"
git push -u origin main
```

O push deve ser feito somente após autorização e revisão do responsável pelo repositório. Em `main`, um CI aprovado inicia o deploy automaticamente.
