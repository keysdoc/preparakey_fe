import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("todos os recursos locais referenciados pelo HTML existem", async () => {
  const pages = ["index.html", "app.html", "offline.html"];
  const references = new Set();

  for (const page of pages) {
    const html = await read(page);
    for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
      const reference = match[1];
      if (!reference.startsWith("#") && !reference.includes(":")) references.add(reference);
    }
  }

  for (const reference of references) {
    await assert.doesNotReject(access(path.join(projectRoot, reference)), reference);
  }
});

test("manifesto PWA é válido e referencia ícones existentes", async () => {
  const manifest = JSON.parse(await read("manifest.webmanifest"));

  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "./");
  assert.equal(manifest.lang, "pt-BR");
  assert.equal(manifest.orientation, "any");
  assert.ok(manifest.display_override.includes("standalone"));
  assert.ok(manifest.start_url);
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);

  for (const icon of manifest.icons) {
    assert.match(icon.sizes, /^\d+x\d+$/);
    await assert.doesNotReject(access(path.join(projectRoot, icon.src)), icon.src);
  }
});

test("fluxo permite avançar após selecionar sem exigir verificação", async () => {
  const app = await read("js/app.js");
  const styles = await read("css/styles.css");

  assert.match(app, /function answerReady\(q\)/);
  assert.match(app, /\$\('nextBtn'\)\.disabled=!ready/);
  assert.match(app, /\$\('verifyBtn'\)\.disabled=!ready \|\| isVer/);
  assert.match(app, /if\(!answerReady\(q\)\)return/);
  assert.doesNotMatch(
    app,
    /\$\('nextBtn'\)\.onclick=.*?current\.verified.*?\$\('finishBtn'\)\.onclick/s,
    "Avançar não pode depender do estado de verificação"
  );
  assert.match(app, /aria-pressed="\$\{sel\.includes\(o\.id\)\}"/);
  assert.match(app, /role="status" aria-live="polite"/);
  assert.match(app, /insertAdjacentElement\('afterend',initialQuizActions\)/);
  assert.match(app, /Há questões não respondidas/);
  assert.doesNotMatch(app, /Há questões não verificadas/);

  assert.match(styles, /\.quiz-flow-actions\{[^}]*position:static/);
  assert.match(styles, /\.quiz-flow-actions button\{[^}]*min-height:48px/);
  assert.match(styles, /100dvh/);
  assert.match(styles, /safe-area-inset-bottom/);
});

test("questionário ativo persiste e navegação respeita WebView/PWA", async () => {
  const app = await read("js/app.js");
  const styles = await read("css/styles.css");

  assert.match(app, /ACTIVE_QUIZ_KEY='preparakey\.activeQuiz'/);
  assert.match(app, /function saveQuizState\(\)/);
  assert.match(app, /function restoreQuizState\(\)/);
  assert.match(app, /questionIds:current\.questions\.map\(q=>q\.id\)/);
  assert.match(app, /elapsedSeconds/);
  assert.match(app, /window\.addEventListener\('pagehide',saveQuizState\)/);
  assert.match(app, /window\.addEventListener\('popstate'/);
  assert.match(app, /window\.history\.pushState/);
  assert.match(app, /aria-current/);
  assert.match(app, /function restoreOptionFocus\(opt\)/);

  assert.match(styles, /#questionario\{[^}]*max-width:1100px/);
  assert.match(styles, /container:question-flow\/inline-size/);
  assert.match(styles, /\.option\.selected:after\{content:'✓ Selecionada'\}/);
  assert.match(styles, /@media\(max-height:500px\)/);
  assert.match(styles, /@media\(forced-colors:active\)/);
});

test("progressão libera próximo simulado ou sessão somente após aprovação", async () => {
  const app = await read("js/app.js");
  const styles = await read("css/styles.css");

  assert.match(app, /function assessmentApproved\(item,type,area\)/);
  assert.match(app, /result\.approved===true/);
  assert.match(app, /function assessmentUnlocked\(items,index,type,area\)/);
  assert.match(app, /items\.slice\(0,index\)\.every\(item=>assessmentApproved\(item,type,area\)\)/);
  assert.match(app, /assessmentUnlocked\(DATA\.simulados,index,'simulado'\)/);
  assert.match(app, /assessmentUnlocked\(allSessions,index,'sessao',area\)/);
  assert.match(app, /assessmentId:current\.assessmentId/);
  assert.match(app, /assessmentType:current\.mode/);
  assert.match(app, /Aprove com \$\{PASS\}% ou mais para liberar o próximo simulado/);
  assert.match(app, /Aprove cada sessão com \$\{PASS\}% ou mais para liberar a próxima/);
  assert.match(styles, /\.study-card\.locked/);
  assert.match(styles, /\.study-card\.completed/);
});

test("lista de áreas exibe cinco itens e permite expandir sem perder a seleção", async () => {
  const html = await read("app.html");
  const app = await read("js/app.js");
  const displayedSource = app.match(/function displayedAreas\(areas,expanded,limit=5\)\{return expanded\?areas:areas\.slice\(0,limit\)\}/)?.[0];
  const toggleSource = app.match(/function canToggleAreas\(areas,limit=5\)\{return areas\.length>limit\}/)?.[0];

  assert.ok(displayedSource, "função de limite das áreas ausente");
  assert.ok(toggleSource, "função de disponibilidade do controle ausente");
  const displayedAreas = vm.runInNewContext(`(${displayedSource})`);
  const canToggleAreas = vm.runInNewContext(`(${toggleSource})`);

  for (const count of [1, 5]) {
    const areas = Array.from({ length: count }, (_, index) => index + 1);
    assert.deepEqual(Array.from(displayedAreas(areas, false)), areas);
    assert.equal(canToggleAreas(areas), false);
  }

  for (const count of [6, 12]) {
    const areas = Array.from({ length: count }, (_, index) => index + 1);
    assert.deepEqual(Array.from(displayedAreas(areas, false)), [1, 2, 3, 4, 5]);
    assert.deepEqual(Array.from(displayedAreas(areas, true)), areas);
    assert.equal(canToggleAreas(areas), true);
  }

  assert.match(html, /id="toggleAreasBtn"[^>]*aria-controls="areaGrid"[^>]*aria-expanded="false"[^>]*hidden>Exibir mais/);
  assert.match(app, /toggleAreasBtn\.textContent=areasExpanded\?'Exibir menos':'Exibir mais'/);
  assert.match(app, /toggleAreasBtn\.setAttribute\('aria-expanded',String\(areasExpanded\)\)/);
  assert.match(app, /renderAreas\(\{preserveExpansion:true,preserveSelection:true\}\)/);
  assert.match(app, /if\(!preserveSelection\)selectedAreaId=null/);
});

test("service worker armazena apenas recursos existentes", async () => {
  const serviceWorker = await read("sw.js");
  const assetsMatch = serviceWorker.match(/const ASSETS=(\[[^;]+\])/);
  assert.ok(assetsMatch, "lista ASSETS não encontrada no service worker");

  const assets = vm.runInNewContext(assetsMatch[1]);
  for (const asset of assets) {
    if (asset === "./") continue;
    await assert.doesNotReject(access(path.join(projectRoot, asset.replace(/^\.\//, ""))), asset);
  }

  assert.match(serviceWorker, /self\.skipWaiting\(\)/);
  assert.match(serviceWorker, /self\.clients\.claim\(\)/);
});

test("versão do aplicativo invalida o cache da PWA", async () => {
  const packageMetadata = JSON.parse(await read("package.json"));
  const configContext = { window: {} };
  vm.runInNewContext(await read("js/config.js"), configContext);
  const serviceWorker = await read("sw.js");

  assert.equal(configContext.window.PREPARAKEY_CONFIG.version, packageMetadata.version);
  assert.ok(serviceWorker.includes(`const CACHE='preparakey-v${packageMetadata.version}'`));
});

test("banco de questões possui IDs e respostas consistentes", async () => {
  const context = { window: {} };
  vm.runInNewContext(await read("js/questions.js"), context);
  const data = context.window.PREPARAKEY_QUESTIONS;

  assert.ok(data);
  assert.ok(Array.isArray(data.simulados));
  assert.ok(Array.isArray(data.areas));

  const questions = data.areas.flatMap((area) => area.sessions.flatMap((session) => session.questions));
  const ids = new Set();

  assert.ok(questions.length > 0);
  for (const question of questions) {
    assert.ok(question.id, "questão sem ID");
    assert.ok(!ids.has(question.id), `ID duplicado: ${question.id}`);
    ids.add(question.id);

    if (question.type === "matching") {
      assert.ok(Array.isArray(question.pairs) && question.pairs.length > 0, question.id);
      assert.equal(question.required, question.pairs.length, question.id);
      assert.ok(question.pairs.every((pair) => pair.left && pair.right), question.id);
      continue;
    }

    if (question.type === "image_hotspot") {
      assert.ok(question.visual?.kind, question.id);
      assert.ok(Array.isArray(question.visual.zones) && question.visual.zones.length >= (question.visual.kind === "mvp-sequences" ? 3 : 4), question.id);
      const zoneIds = new Set(question.visual.zones.map((zone) => zone.id));
      assert.equal(zoneIds.size, question.visual.zones.length, question.id);
      assert.ok(question.visual.zones.every((zone) => zone.id && zone.label), question.id);
      assert.ok(Array.isArray(question.answer) && question.answer.length === 1, question.id);
      assert.ok(question.answer.every((answer) => zoneIds.has(answer)), question.id);
      assert.equal(question.required, 1, question.id);
      continue;
    }

    assert.ok(["single", "multiple"].includes(question.type), question.id);
    assert.ok(Array.isArray(question.options) && question.options.length >= 2, question.id);
    const optionIds = new Set(question.options.map((option) => option.id));
    assert.ok(Array.isArray(question.answer) && question.answer.length > 0, question.id);
    assert.ok(question.answer.every((answer) => optionIds.has(answer)), question.id);
    assert.equal(question.required, question.answer.length, question.id);
  }
});

test("somente a nova base autorizada é carregada", async () => {
  const context = { window: {} };
  vm.runInNewContext(await read("js/questions.js"), context);
  const data = context.window.PREPARAKEY_QUESTIONS;
  const expectedTitles = [
    "1. Fundamentos de gerenciamento de projetos e entrega de valor",
    "2. Ambiente do projeto, contexto organizacional, governança e PMO",
    "3. Abordagens de desenvolvimento, ciclo de vida e adaptação",
    "4. Mentalidade, papel do gerente de projetos e liderança",
    "5. Visão comum, liderança da equipe e conflitos",
    "6. Iniciação do projeto e termo de abertura",
    "7. Partes interessadas e transferência de conhecimento",
    "8. Planejamento integrado do projeto",
    "9. Comunicações e relatórios",
    "10. Escopo, requisitos, backlog e aceitação",
    "11. Qualidade incorporada a processos e entregas",
    "12. Cronograma, estimativas, capacidade e fluxo"
  ];
  const expectedCounts = [132, 148, 184, 125, 139, 55, 210, 55, 189, 154, 127, 126];
  const questions = data.areas.flatMap((area) => area.sessions.flatMap((session) => session.questions));

  assert.equal(data.simulados.length, 1, "o simulado existente deve permanecer único");
  assert.deepEqual(Array.from(data.areas, (area) => area.title), expectedTitles);
  assert.deepEqual(
    Array.from(data.areas, (area) => area.sessions.reduce((total, session) => total + session.questions.length, 0)),
    expectedCounts
  );
  assert.equal(data.contentSource, "PMP - BOOK 8, áreas 1–12");
  assert.equal(questions.length, 1644);

  for (const [areaIndex, area] of data.areas.entries()) {
    assert.equal(area.sessions.length, 16, `${area.title}: sessões 1–16`);
    assert.deepEqual(Array.from(area.sessions, (session) => session.number), Array.from({ length: 16 }, (_, index) => index + 1));
    for (const session of area.sessions) {
      const numbers = Array.from(session.questions, (question) => question.number);
      assert.deepEqual(numbers, [...numbers].sort((left, right) => left - right), `${session.id}: ordem das questões`);
      assert.equal(new Set(numbers).size, numbers.length, `${session.id}: numeração duplicada`);
      assert.ok(session.questions.every((question) => question.session === session.number));
      const prefix = areaIndex === 0 ? "fund" : `area${areaIndex + 1}`;
      assert.ok(session.questions.every((question) => question.id === `${prefix}-s${session.number}-q${question.number}`));
    }
  }

  assert.deepEqual(Array.from(data.excludedUnsupported), []);
  assert.deepEqual(Array.from(data.recoveredVisualQuestions), [
    "area5-s12-q3",
    "area5-s13-q7",
    "area7-s2-q10",
    "area7-s7-q3",
    "area7-s7-q11",
    "area7-s8-q3",
    "area7-s14-q5",
    "area9-s3-q4",
    "area9-s11-q1",
    "area10-s3-q4",
    "area11-s1-q4"
  ]);
  assert.deepEqual(Array.from(data.removedDuplicates, (item) => item.id), [
    "fund-s8-q2",
    "area2-s16-q6",
    "area4-s6-q6",
    "area6-s13-q4",
    "area11-s16-q1",
    "area11-s16-q2",
    "area11-s16-q3",
    "area11-s16-q4",
    "area11-s16-q5",
    "area11-s16-q6",
    "area11-s16-q7",
    "area11-s16-q8",
    "area11-s16-q9"
  ]);
  assert.ok(questions.every((question) => !/^13\./.test(String(question.source))));

  const normalized = (value) => String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  const fingerprints = questions.map((question) => JSON.stringify({
    type: question.type,
    question: normalized(question.question),
    options: (question.options || []).map((option) => [option.id, normalized(option.text)]),
    pairs: (question.pairs || []).map((pair) => [normalized(pair.left), normalized(pair.right)]),
    answer: question.answer
  }));
  assert.equal(new Set(fingerprints).size, questions.length, "não pode haver perguntas duplicadas");
});

test("simulado consolida as 16 sessões sem duplicar o banco de questões", async () => {
  const context = { window: {} };
  vm.runInNewContext(await read("js/questions.js"), context);
  const data = context.window.PREPARAKEY_QUESTIONS;
  const exam = data.simulados[0];
  const sessions = data.areas.flatMap((area) => area.sessions);
  const sessionIds = new Set(exam.sessionIds);
  const examQuestions = sessions
    .filter((session) => sessionIds.has(session.id))
    .flatMap((session) => session.questions);

  assert.equal(exam.id, "simulado-fundamentos-1-16");
  assert.equal(exam.available, true);
  assert.equal(exam.questions, undefined, "o simulado deve referenciar a base, não duplicá-la");
  assert.deepEqual(Array.from(exam.sessionIds), Array.from({ length: 16 }, (_, index) => `fund-s${index + 1}`));
  assert.equal(examQuestions.length, 132);
  assert.equal(new Set(examQuestions.map((question) => question.id)).size, 132);
});

test("sessões exclusivamente em imagem preservam conteúdo e gabarito verificados", async () => {
  const context = { window: {} };
  vm.runInNewContext(await read("js/questions.js"), context);
  const data = context.window.PREPARAKEY_QUESTIONS;
  const areaSevenSessionEight = data.areas[6].sessions[7];
  const areaEightSessionNine = data.areas[7].sessions[8];
  const areaEightSessionTwelve = data.areas[7].sessions[11];
  const areaNineSessionThree = data.areas[8].sessions[2];
  const areaNineSessionFour = data.areas[8].sessions[3];
  const areaNineSessionEleven = data.areas[8].sessions[10];

  assert.equal(areaSevenSessionEight.questions.length, 13, "Hot Area 7-8-3 deve usar o componente visual");
  assert.deepEqual(Array.from(areaSevenSessionEight.questions, (question) => question.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual(Array.from(areaSevenSessionEight.questions, (question) => question.answer[0]), ["A", "C", "phase-4", "C", "C", "A", "C", "B", "B", "D", "A", "A", "C"]);
  assert.equal(areaSevenSessionEight.questions[2].type, "image_hotspot");
  assert.deepEqual(Array.from(areaEightSessionNine.questions, (question) => question.answer[0]), ["D", "B", "B"]);
  assert.deepEqual(Array.from(areaEightSessionTwelve.questions, (question) => question.answer[0]), ["B", "A", "D"]);
  assert.match(areaEightSessionTwelve.questions[0].question, /Renovação Automática de Medicamentos/);
  assert.ok(areaEightSessionNine.questions.every((question) => question.reference.includes("Gabarito - 8.9.png")));
  assert.deepEqual(Array.from(areaNineSessionThree.questions, (question) => question.answer[0]), ["A", "C", "D", "D", "A", "A", "C", "B", "C", "B", "B"]);
  assert.equal(areaNineSessionThree.questions[3].support?.type, "burndown");
  assert.equal(areaNineSessionFour.questions.length, 12);
  assert.equal(areaNineSessionEleven.questions[0].support?.type, "case");
  assert.deepEqual(Array.from(areaNineSessionEleven.questions[8].answer), ["A", "E"]);
});

test("áreas reutilizam os cards e o questionário existentes sem sistema paralelo", async () => {
  const html = await read("app.html");
  const app = await read("js/app.js");
  const styles = await read("css/styles.css");
  const importer = await read("scripts/import-knowledge.mjs");

  assert.equal((html.match(/class="nav-item app-nav"[^>]*data-view="areas"/g) || []).length, 1);
  assert.equal((html.match(/class="mobile-nav-item app-nav"[^>]*data-view="areas"/g) || []).length, 1);
  assert.match(app, /function renderAreas\(/);
  assert.match(app, /function renderSessions\(area\)/);
  assert.match(app, /const allSessions=area\.sessions/);
  assert.match(app, /card\.className=`study-card/);
  assert.match(app, /startQuiz\(assessmentTitle\(s,'sessao',area\),s\.questions,'sessao',s\.id\)/);
  assert.match(app, /function renderQuestion\(\)/);
  assert.match(app, /data-pair="\$\{pairIndex\}"/);
  assert.doesNotMatch(html, /data-view="book8"|book8Tree|js\/book8\.js/);
  assert.doesNotMatch(app, /PREPARAKEY_BOOK8|renderBook8|book8Question/);
  assert.doesNotMatch(styles, /\.book8-/);
  assert.match(importer, /8\. Planejamento integrado do projeto/);
  assert.match(importer, /12\. Cronograma, estimativas, capacidade e fluxo/);
  assert.doesNotMatch(importer, /folder:\s*"13\./);
  assert.doesNotMatch(importer, /readdir\(sourceRoot/);
  await assert.rejects(access(path.join(projectRoot, "js", "book8.js")));
  await assert.rejects(access(path.join(projectRoot, "scripts", "import-book8.mjs")));
});

test("materiais visuais usam HTML acessível sem publicar capturas completas", async () => {
  const context = { window: {} };
  vm.runInNewContext(await read("js/questions.js"), context);
  const data = context.window.PREPARAKEY_QUESTIONS;
  const app = await read("js/app.js");
  const styles = await read("css/styles.css");
  const questions = data.areas.flatMap((area) => area.sessions.flatMap((session) => session.questions));
  const visual = questions.filter((question) => question.type === "image_hotspot");
  const tables = questions.filter((question) => question.support?.type === "table");

  assert.equal(visual.length, 7);
  assert.equal(tables.length, 2);
  assert.ok(visual.every((question) => question.audit?.confidence === "high" && question.audit.reviewRequired === false));
  assert.ok(tables.every((question) => question.audit?.confidence === "high" && question.audit.reviewRequired === false));
  assert.ok(questions.every((question) => !question.image), "capturas completas não devem ser publicadas como questão");

  assert.match(app, /function renderSupport\(q\)/);
  assert.match(app, /<table class="support-table">/);
  assert.match(app, /function renderHotspot\(q,isVer,sel\)/);
  assert.match(app, /role="group" aria-label=/);
  assert.match(app, /draggable="true"/);
  assert.match(app, /toque na opção e depois no destino/);
  assert.match(styles, /\.hotspot-canvas/);
  assert.match(styles, /\.support-table-wrap/);
  assert.match(styles, /\.hotspot-sequence-grid/);
  assert.match(styles, /\.hotspot-scatter-grid/);
  assert.match(styles, /@media\(max-width:620px\)/);
  assert.match(styles, /@media\(forced-colors:active\)/);
});

test("auditoria de conteúdo mantém inventário e rastreabilidade verificáveis", async () => {
  const report = await read("docs/content-audit.md");
  const rows = (await read("docs/content-audit.csv")).trim().split(/\r?\n/);
  const auditScript = await read("scripts/audit-content.mjs");

  assert.equal(rows.length, 1645, "cabeçalho mais uma linha por questão ativa");
  assert.match(report, /2113 arquivos processados/);
  assert.match(report, /2240 arquivos/);
  assert.match(report, /1644 questões/);
  assert.match(report, /7 hotspots e 2 tabelas/);
  assert.match(report, /9\. Comunicações e relatórios/);
  assert.match(report, /Área 13 e demais áreas posteriores/);
  assert.match(report, /PERUNTAS A PADRONIZAR WEB\/15\.png/);
  assert.match(auditScript, /sha256/);
  assert.match(auditScript, /reviewRequired/);
});

test("blueprint documenta a arquitetura e os contratos reais do frontend", async () => {
  const blueprint = await read("docs/frontend-blueprint.md");

  assert.match(blueprint, /PWA estática, local-first/);
  assert.match(blueprint, /#dashboard/);
  assert.match(blueprint, /#simulados/);
  assert.match(blueprint, /#areas/);
  assert.match(blueprint, /#questionario/);
  assert.match(blueprint, /#historico/);
  assert.match(blueprint, /#configuracoes/);
  assert.match(blueprint, /preparakey\.activeQuiz/);
  assert.match(blueprint, /Avançar.*funciona com ou sem verificação/);
  assert.match(blueprint, /Não há gráficos por domínio/);
});

test("dashboard usa apenas indicadores derivados do histórico real", async () => {
  const html = await read("app.html");
  const app = await read("js/app.js");

  assert.match(html, /Taxa de aprovação/);
  assert.match(html, /Evolução recente/);
  assert.match(app, /approved\/hist\.length\*100/);
  assert.match(app, /function drawTrend\(hist\)/);
  assert.match(app, /hist\.slice\(0,6\)\.reverse\(\)/);
  assert.doesNotMatch(app, /\['Pessoas'/);
  assert.doesNotMatch(app, /\['Processo'/);
  assert.doesNotMatch(app, /\['Negócio'/);
  assert.doesNotMatch(app, /score\|\|0\)-4/);
});

test("shell adaptativo expõe navegação, progresso e estados acessíveis", async () => {
  const html = await read("app.html");
  const app = await read("js/app.js");
  const styles = await read("css/styles.css");

  assert.match(html, /class="skip-link"/);
  assert.match(html, /id="sidebarBackdrop"/);
  assert.match(html, /id="bottomNav"/);
  assert.match(html, /id="quizProgress"/);
  assert.match(html, /aria-controls="sidebar"/);
  assert.match(app, /function setSidebar\(open\)/);
  assert.match(app, /event\.key==='Escape'/);
  assert.match(app, /\$\('quizProgress'\)\.value=progress/);
  assert.match(app, /requestAnimationFrame\(\(\)=>window\.requestAnimationFrame/);
  assert.match(styles, /\.bottom-nav\{/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /@media\(max-width:360px\)/);
  assert.match(styles, /@media\(max-height:520px\)/);
});

test("questão de associação da sessão 16 usa somente os pares da fonte", async () => {
  const context = { window: {} };
  vm.runInNewContext(await read("js/questions.js"), context);
  const question = context.window.PREPARAKEY_QUESTIONS.areas[0].sessions[15].questions[4];

  assert.equal(question.id, "fund-s16-q5");
  assert.equal(question.type, "matching");
  assert.deepEqual(Array.from(question.pairs, (pair) => `${pair.left}=${pair.right}`), [
    "Ágil=Valor para o cliente por meio de entregas e feedback frequentes",
    "Iterativa=Correção da solução",
    "Incremental=Velocidade",
    "Preditiva=Gerenciamento do custo"
  ]);
});

test("Questão 1 pronta permanece inalterada", async () => {
  const context = { window: {} };
  vm.runInNewContext(await read("js/questions.js"), context);
  const question = context.window.PREPARAKEY_QUESTIONS.areas[0].sessions[0].questions[0];
  const fingerprint = createHash("sha256").update(JSON.stringify(question)).digest("hex");

  assert.equal(fingerprint, "e790ab4ece0b622b735ae7ab14a41b3b21116bbddd580735302bfcb552657f76");
  assert.deepEqual(Array.from(question.answer), ["D"]);
});

test("página inicial não contém credenciais embutidas", async () => {
  const index = await read("index.html");
  const config = await read("js/config.js");

  assert.doesNotMatch(index, /type=["']password["']/i);
  assert.doesNotMatch(config, /\b(?:login|password|senha)\b/i);
});
