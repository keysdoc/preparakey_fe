# Planejamento integrado do PreparaKey

Este documento consolida o planejamento verificável no repositório para a entrega da área **8. Planejamento integrado do projeto**. Ele descreve a linha de base técnica atual, as relações entre as áreas de gerenciamento e as pendências que dependem de decisões ou infraestrutura externas. Não substitui cronograma, orçamento ou aprovações organizacionais que não estejam versionados.

## Linha de base e escopo

- Produto: PWA estática em HTML, CSS e JavaScript, sem framework, backend, banco de dados ou migrações.
- Conteúdo: `PMP - BOOK 8`, áreas 1–8, com 16 sessões por área.
- Base ativa: 1.043 questões; tipos suportados `single`, `multiple` e `matching`.
- Navegação: os fluxos existentes de **Áreas de Conhecimento** e **Simulados** compartilham o mesmo questionário em `js/app.js`.
- Aprovação: 75%, configurada em `js/config.js`; a próxima sessão/simulado só é liberada após aprovação.
- Persistência: progresso local no navegador, sem sincronização remota.
- Fora do escopo desta entrega: áreas 9 e posteriores, criação de um novo componente de pergunta, autenticação real, backend, banco de dados e suporte a seleção visual `Hot Area`.

Evidências: `app.html`, `js/app.js`, `js/config.js`, `js/questions.js`, `scripts/import-knowledge.mjs` e `tests/static-site.test.mjs`.

## Integração do conteúdo da área 8

A fonte controlada pelo importador é `C:\Users\adm\Documents\Screenshots\PMP - BOOK 8`. A lista de diretórios permitidos termina explicitamente em `8. Planejamento integrado do projeto`; o script não enumera automaticamente novas áreas.

O importador valida estrutura, numeração, alternativas, associações, respostas e duplicatas. As sessões sem TXT são tratadas como exceções auditáveis:

| Área/sessão | Fonte | Tratamento |
| --- | --- | --- |
| 7/8 | 13 imagens de questão + gabarito | transcrição explícita; hashes SHA-256 impedem uso após alteração da fonte; questão 3 `Hot Area` excluída |
| 8/9 | 3 imagens de questão + gabarito | transcrição explícita e protegida por SHA-256 |
| 8/12 | caso, 3 imagens de questão + gabarito | caso e questões transcritos explicitamente e protegidos por SHA-256 |

As associações cujo TXT não representa os pares de forma inequívoca possuem mapeamentos explícitos validados pelo hash do bloco original e pelo screenshot de resposta correta. Não há geração de perguntas ou respostas por fallback.

## Planos integrados

| Área | Linha de base verificável | Controle e relação com as demais áreas |
| --- | --- | --- |
| Escopo | áreas 1–8, mesmos componentes e fluxos | testes fixam títulos, sessões, totais, IDs, origem e ausência de duplicatas |
| Cronograma | CI em cada `push` e `pull_request`; CD após CI aprovado em `main` | não há datas, marcos de negócio ou responsáveis nominais versionados; permanecem pendentes |
| Custos | aplicação estática, sem serviço pago declarado | orçamento e limite de custos não constam no repositório; GitHub Pages em repositório privado depende do plano da conta |
| Qualidade | lint, auditoria de dependências, busca de segredos, testes, validação YAML e build | qualquer falha interrompe o CI; `npm run check` reproduz os gates localmente |
| Recursos | Node.js 24, npm 10.9.8 e GitHub Actions | responsáveis nominais, disponibilidade e matriz de papéis não estão versionados |
| Riscos | fonte externa ao Git; sessões somente em imagem; cache PWA; persistência apenas local; Pages condicionado | hashes, testes de contrato, versão de cache e deploy condicionado reduzem os riscos técnicos |
| Comunicação | README, este plano, histórico Git e logs do Actions | frequência de reporte e destinatários organizacionais não estão definidos |
| Aquisições | nenhuma dependência operacional ou fornecedor de aplicação declarado | eventual plano pago de hospedagem ou provedor alternativo exige decisão externa |
| Partes interessadas | usuário estudante, responsável pelo conteúdo e mantenedor do repositório são papéis observáveis | nomes, aprovações e autoridade de decisão não estão registrados; não foram inferidos |
| Configuração | `package-lock.json`, `.nvmrc`, actions fixadas por SHA e cache PWA versionado | alterações de conteúdo exigem reimportação, testes, revisão do diff e novo CI |

## Sequência de entrega e critérios de aceite

1. Executar o importador com a fonte local autorizada.
2. Revisar totais, exclusões e duplicatas registradas.
3. Executar `npm ci`, `npm audit --audit-level=high` e `npm run check`.
4. Validar os fluxos no navegador e confirmar ausência de erros no console.
5. Revisar `git diff` e executar a busca de segredos.
6. Enviar a revisão para `main`; o CI valida o commit.
7. O CD publica o mesmo SHA somente quando `ENABLE_GITHUB_PAGES=true` e o ambiente Pages está disponível.

Aceite técnico: 8 áreas, 128 sessões, 1.043 questões ativas, 4 duplicatas integrais registradas, 5 itens `Hot Area` excluídos, testes e build aprovados, e nenhum conteúdo de área 9 ou posterior.

## Riscos, premissas e pendências externas

- **Hospedagem:** o repositório não contém infraestrutura alternativa ao GitHub Pages. A variável `ENABLE_GITHUB_PAGES` deve permanecer ausente até o Pages estar autorizado e configurado.
- **Conteúdo-fonte:** os screenshots não estão no Git. A reimportação depende do caminho local documentado; qualquer mudança nas sessões por imagem exige revisão manual e atualização deliberada dos hashes.
- **Hot Area:** cinco questões exigem interação por região de imagem, inexistente no produto. Elas estão registradas, mas fora do fluxo; implementar esse tipo requer requisito e componente próprios.
- **Governança:** orçamento, datas, responsáveis, homologação e aprovação editorial não são evidenciados no repositório.
- **Persistência:** o progresso é local ao navegador. Sincronização entre dispositivos depende de backend ainda não definido.

Nenhuma credencial, URL privada, data ou responsável foi inventado para preencher essas lacunas.
