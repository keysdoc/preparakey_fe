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

As perguntas das sessões 1 a 15 podem ser atualizadas a partir dos arquivos `Gabarito*.txt` do material de origem:

```powershell
npm run import:knowledge -- --source "C:\Users\adm\Documents\Screenshots\PMP - BOOK 8\1. Fundamentos de gerenciamento de projetos e entrega de valor"
```

O importador valida a quantidade declarada, as alternativas e o gabarito antes de substituir as sessões. Sessões posteriores são preservadas.

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

## Deploy

O workflow `.github/workflows/deploy.yml` publica em GitHub Pages somente quando a variável de repositório `ENABLE_GITHUB_PAGES` é `true` e o workflow `CI` termina com sucesso para um `push` na branch `main`. O deploy faz checkout exato do commit validado, instala dependências sem cache privilegiado, refaz o build e publica `dist/`.

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
