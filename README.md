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

O simulado existente permanece único e referencia somente as 16 sessões da primeira área, sem copiar perguntas. “Áreas de Conhecimento” reutiliza os cards de área/sessão e o mesmo questionário da aplicação. A lista mostra inicialmente cinco áreas e oferece o controle acessível “Exibir mais/Exibir menos” quando houver áreas adicionais.

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

### Netlify (produção)

O site de produção é [https://prepkey.netlify.app](https://prepkey.netlify.app), ligado à branch `main` do repositório `keysdoc/preparakey_fe` pela integração nativa Git do Netlify. A configuração versionada em `netlify.toml` fixa Node.js 24/npm 10.9.8, audita as dependências, executa `npm run check` e publica exclusivamente o artefato `dist/`. Assim, auditoria, lint, verificação de segredos, testes, validação dos workflows e build precisam passar antes da publicação.

Pushes em `main` geram deploy de produção. Pull requests podem gerar Deploy Previews pela integração do Netlify. Não há credenciais no repositório: a autorização entre GitHub e Netlify é administrada pela instalação Git do site. O `NETLIFY_SITE_ID`, quando usado para comandos administrativos ou deploys manuais, deve permanecer cadastrado como secret e nunca ser incluído nos arquivos públicos.

Para diagnosticar uma falha, abra **Netlify > prepkey > Deploys**, identifique a primeira etapa com erro e reproduza localmente com `npm ci` e `npm run check`. Um deploy manual de recuperação, somente por operador autenticado, pode ser feito depois de um build validado com `netlify deploy --dir dist --prod --site <NETLIFY_SITE_ID>`.

### GitHub Pages (espelho)

O workflow `.github/workflows/deploy.yml` também publica um espelho em GitHub Pages quando a variável de repositório `ENABLE_GITHUB_PAGES` é `true` e o workflow `CI` termina com sucesso para um `push` na branch `main`. Pull requests e pushes em outras branches executam apenas CI. Esse deploy faz checkout exato do commit validado, instala dependências, refaz o build e publica `dist/` usando apenas o `GITHUB_TOKEN` efêmero com permissões mínimas de Pages e OIDC.

Para repetir o espelho manualmente, abra a execução concluída do workflow **Deploy** no GitHub Actions e selecione **Re-run jobs**; isso reutiliza um commit cujo CI já passou.

## Publicação

Revise e valide as alterações antes de publicar:

```bash
git add .
git commit -m "ci: configure frontend validation and Pages deploy"
git push -u origin main
```

O push deve ser feito somente após autorização e revisão do responsável pelo repositório. Em `main`, um CI aprovado inicia o deploy automaticamente.
