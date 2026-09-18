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
  assert.equal(manifest.orientation, "any");
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
      continue;
    }

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
  const sessions = data.areas[0].sessions;
  const expectedCounts = [9, 8, 9, 8, 8, 8, 8, 9, 9, 8, 8, 9, 8, 8, 7, 9];
  const questions = sessions.flatMap((session) => session.questions);

  assert.equal(data.simulados.length, 1, "deve existir somente o simulado derivado da nova base");
  assert.equal(data.areas.length, 1);
  assert.equal(sessions.length, 16, "a nova base deve conter somente as sessões 1–16");

  for (const [index, expectedCount] of expectedCounts.entries()) {
    const sessionNumber = index + 1;
    const session = sessions[index];
    assert.equal(session.number, sessionNumber, `ordem da sessão ${sessionNumber}`);
    assert.equal(session.questions.length, expectedCount, `quantidade da sessão ${sessionNumber}`);
    assert.deepEqual(
      Array.from(session.questions, (question) => question.number),
      Array.from({ length: expectedCount }, (_, questionIndex) => questionIndex + 1),
      `numeração da sessão ${sessionNumber}`
    );
    assert.ok(
      session.questions.every((question) => question.id === `fund-s${sessionNumber}-q${question.number}`),
      `IDs da sessão ${sessionNumber}`
    );
  }

  assert.equal(questions.length, 133);
  assert.equal(new Set(questions.map((question) => question.id)).size, 133);
  assert.ok(questions.every((question) => question.session >= 1 && question.session <= 16));
});

test("simulado consolida as 16 sessões sem duplicar o banco de questões", async () => {
  const context = { window: {} };
  vm.runInNewContext(await read("js/questions.js"), context);
  const data = context.window.PREPARAKEY_QUESTIONS;
  const exam = data.simulados[0];
  const sessions = data.areas[0].sessions;
  const sessionIds = new Set(exam.sessionIds);
  const examQuestions = sessions
    .filter((session) => sessionIds.has(session.id))
    .flatMap((session) => session.questions);

  assert.equal(exam.id, "simulado-fundamentos-1-16");
  assert.equal(exam.available, true);
  assert.equal(exam.questions, undefined, "o simulado deve referenciar a base, não duplicá-la");
  assert.deepEqual(Array.from(exam.sessionIds), Array.from({ length: 16 }, (_, index) => `fund-s${index + 1}`));
  assert.equal(examQuestions.length, 133);
  assert.equal(new Set(examQuestions.map((question) => question.id)).size, 133);
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
