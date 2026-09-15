import assert from "node:assert/strict";
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
  assert.ok(manifest.start_url);
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);

  for (const icon of manifest.icons) {
    assert.match(icon.sizes, /^\d+x\d+$/);
    await assert.doesNotReject(access(path.join(projectRoot, icon.src)), icon.src);
  }
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

  const questions = [
    ...data.simulados.flatMap((exam) => exam.questions),
    ...data.areas.flatMap((area) => area.sessions.flatMap((session) => session.questions))
  ];
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

test("sessões 1 a 15 contêm todas as perguntas do material de origem", async () => {
  const context = { window: {} };
  vm.runInNewContext(await read("js/questions.js"), context);
  const sessions = context.window.PREPARAKEY_QUESTIONS.areas[0].sessions;
  const expectedCounts = [9, 8, 9, 8, 8, 8, 8, 9, 9, 8, 8, 9, 8, 8, 7];

  for (const [index, expectedCount] of expectedCounts.entries()) {
    const sessionNumber = index + 1;
    const session = sessions.find((item) => item.number === sessionNumber);
    assert.ok(session, `sessão ${sessionNumber} ausente`);
    assert.equal(session.questions.length, expectedCount, `sessão ${sessionNumber}`);
    assert.deepEqual(
      Array.from(session.questions, (question) => question.number),
      Array.from({ length: expectedCount }, (_, questionIndex) => questionIndex + 1),
      `numeração da sessão ${sessionNumber}`
    );
  }

  assert.equal(expectedCounts.reduce((total, count) => total + count, 0), 124);
});

test("página inicial não contém credenciais embutidas", async () => {
  const index = await read("index.html");
  const config = await read("js/config.js");

  assert.doesNotMatch(index, /type=["']password["']/i);
  assert.doesNotMatch(config, /\b(?:login|password|senha)\b/i);
});
