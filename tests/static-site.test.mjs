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

test("somente a nova base autorizada é carregada", async () => {
  const context = { window: {} };
  vm.runInNewContext(await read("js/questions.js"), context);
  const data = context.window.PREPARAKEY_QUESTIONS;
  const sessions = data.areas[0].sessions;
  const questions = sessions[0].questions;

  assert.equal(data.simulados.length, 0, "simulados legados ainda presentes");
  assert.equal(data.areas.length, 1);
  assert.equal(sessions.length, 1, "sessões legadas ainda presentes");
  assert.equal(questions.length, 9, "a nova base atual contém 9 questões");
  assert.deepEqual(Array.from(questions, (question) => question.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(Array.from(questions, (question) => question.id), [
    "fund-s1-q1", "fund-s1-q2", "fund-s1-q3", "fund-s1-q4", "fund-s1-q5",
    "fund-s1-q6", "fund-s1-q7", "fund-s1-q8", "fund-s1-q9"
  ]);
  assert.ok(questions.every((question) => question.number <= 15));
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
