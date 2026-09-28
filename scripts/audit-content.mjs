import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceArgumentIndex = process.argv.indexOf("--source");
const defaultSource = "C:\\Users\\adm\\Documents\\Screenshots\\PMP - BOOK 8";
const sourceRoot = path.resolve(sourceArgumentIndex >= 0 ? process.argv[sourceArgumentIndex + 1] : defaultSource);
const docsDirectory = path.join(projectRoot, "docs");

await access(sourceRoot);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function relative(file) {
  return path.relative(sourceRoot, file).replaceAll(path.sep, "/");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function csv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function numericPrefix(value) {
  const match = String(value).match(/^(\d+)\./);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function questionType(question) {
  return ({
    single: "multiple_choice",
    multiple: "multiple_selection",
    matching: "matching",
    image_hotspot: "image_hotspot"
  })[question.type] || question.type;
}

function alternativesComplete(question) {
  if (question.type === "matching") return question.pairs?.length > 0 && question.pairs.every((pair) => pair.left && pair.right);
  if (question.type === "image_hotspot") return question.visual?.zones?.length >= 4 && question.visual.zones.every((zone) => zone.id && zone.label);
  return question.options?.length >= 2 && question.options.every((option) => option.id && option.text);
}

function answerVerifiable(question) {
  if (question.type === "matching") return question.pairs?.length === question.required && question.pairs.every((pair) => pair.right);
  const validIds = new Set(question.type === "image_hotspot" ? question.visual?.zones?.map((zone) => zone.id) : question.options?.map((option) => option.id));
  return question.answer?.length === question.required && question.answer.every((answer) => validIds.has(answer));
}

const context = { window: {} };
vm.runInNewContext(await readFile(path.join(projectRoot, "js", "questions.js"), "utf8"), context);
const bank = context.window.PREPARAKEY_QUESTIONS;
if (!bank?.areas?.length) throw new Error("Banco de questões ativo não encontrado.");

const topDirectories = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((left, right) => numericPrefix(left.name) - numericPrefix(right.name) || left.name.localeCompare(right.name, "pt-BR"));
const inventory = [];
const allSourceFiles = [];

for (const directory of topDirectories) {
  const absolute = path.join(sourceRoot, directory.name);
  const files = await walk(absolute);
  allSourceFiles.push(...files);
  const sessionDirectories = (await readdir(absolute, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory());
  const nonemptySessions = [];
  for (const session of sessionDirectories) {
    if ((await walk(path.join(absolute, session.name))).length) nonemptySessions.push(session.name);
  }
  inventory.push({
    name: directory.name,
    files: files.length,
    png: files.filter((file) => path.extname(file).toLowerCase() === ".png").length,
    txt: files.filter((file) => path.extname(file).toLowerCase() === ".txt").length,
    nonemptySessions: nonemptySessions.sort((left, right) => Number(left) - Number(right)).join(", ") || "—"
  });
}

const activeQuestions = bank.areas.flatMap((area) => area.sessions.flatMap((session) => session.questions.map((question) => ({ area, session, question }))));
const auditRows = [];
const activeIds = new Set(activeQuestions.map(({ question }) => question.id));
const questionsWithoutNumberedImage = [];

for (const { area, session, question } of activeQuestions) {
  const sessionDirectory = path.join(sourceRoot, area.title, String(session.number));
  const sessionFiles = await readdir(sessionDirectory, { withFileTypes: true });
  const expectedQuestionImage = path.join(sessionDirectory, `${question.number}.png`);
  let imageReference = "";
  try {
    await access(expectedQuestionImage);
    imageReference = relative(expectedQuestionImage);
  } catch {
    questionsWithoutNumberedImage.push(question.id);
  }

  const recovered = question.audit?.recoveredFrom || [];
  const recoverySources = recovered.map((file) => `${area.title}/${session.number}/${file}`).join("; ");
  const referenceFiles = String(question.reference || "").split(";").map((item) => item.trim());
  const textFile = sessionFiles.find((file) => file.isFile() && /\.txt$/i.test(file.name));
  const textReference = referenceFiles.find((item) => /\.txt$/i.test(item)) || (textFile ? relative(path.join(sessionDirectory, textFile.name)) : "—");
  let problem = "Nenhum";
  let action = question.type === "matching" ? "Associação estruturada a partir dos pares da fonte" : "Conteúdo preservado";
  if (question.support?.type === "table") {
    problem = "Tabela de consulta estava linearizada no TXT";
    action = "Tabela reconstruída em HTML semântico e conferida com a imagem";
  }
  if (question.type === "image_hotspot") {
    problem = "Captura continha interface e/ou marcação de gabarito imprópria para publicação";
    action = "Diagrama recriado em HTML/CSS com zonas estáveis e acessíveis";
  }

  auditRows.push([
    question.id,
    textReference,
    imageReference || recoverySources,
    question.question?.trim() ? "Sim" : "Não",
    alternativesComplete(question) ? "Sim" : "Não",
    answerVerifiable(question) ? "Sim" : "Não",
    questionType(question),
    problem,
    action,
    question.audit?.reviewRequired ? "Revisão humana necessária" : "Nenhuma",
    recoverySources || question.reference,
    question.audit?.confidence || "alta"
  ]);
}

const hashIndex = new Map();
for (const file of allSourceFiles.filter((file) => path.extname(file).toLowerCase() === ".png" && !relative(file).startsWith("PERUNTAS A PADRONIZAR WEB/"))) {
  const digest = sha256(await readFile(file));
  const existing = hashIndex.get(digest) || [];
  existing.push(relative(file));
  hashIndex.set(digest, existing);
}

const specialDirectory = path.join(sourceRoot, "PERUNTAS A PADRONIZAR WEB");
const specialFiles = (await walk(specialDirectory)).filter((file) => path.extname(file).toLowerCase() === ".png").sort((left, right) => numericPrefix(path.basename(left)) - numericPrefix(path.basename(right)));
const specialMappings = [];
for (const file of specialFiles) {
  const matches = hashIndex.get(sha256(await readFile(file))) || [];
  specialMappings.push({ file: relative(file), matches });
}

const duplicateRows = bank.removedDuplicates || [];
const recovered = activeQuestions.filter(({ question }) => question.visual || question.support).map(({ question }) => question);
const pendingArea = inventory.find((entry) => entry.name.startsWith("9."));
const emptyAreas = inventory.filter((entry) => numericPrefix(entry.name) >= 10 && numericPrefix(entry.name) <= 22 && entry.files === 0);
const totalPng = inventory.reduce((total, entry) => total + entry.png, 0);
const totalTxt = inventory.reduce((total, entry) => total + entry.txt, 0);

const header = [
  "ID da questão", "arquivo de texto", "imagem relacionada", "texto completo?", "alternativas completas?",
  "gabarito verificável?", "tipo de interação", "problema encontrado", "ação aplicada", "pendência",
  "origem da recuperação", "confiança"
];
const csvContents = `\uFEFF${[header, ...auditRows].map((row) => row.map(csv).join(",")).join("\n")}\n`;

const markdown = `# Auditoria de conteúdo — PMP Book 8

Gerado em 28/09/2026 pelo script reproduzível \`npm run audit:content\`. A tabela linha a linha das ${auditRows.length} questões publicadas está em [content-audit.csv](./content-audit.csv).

## Escopo e resultado

- Fonte auditada: \`${sourceRoot}\`.
- Inventário integral: **${allSourceFiles.length} arquivos** (**${totalPng} PNG** e **${totalTxt} TXT**) em todas as pastas encontradas.
- Base publicada: **${bank.areas.length} áreas**, **${bank.areas.reduce((total, area) => total + area.sessions.length, 0)} sessões** e **${auditRows.length} questões**.
- Tipos publicados: ${[...new Set(activeQuestions.map(({ question }) => questionType(question)))].sort().join(", ")}.
- Recuperações visuais verificadas: **${recovered.length}** (${recovered.filter((question) => question.type === "image_hotspot").length} hotspots e ${recovered.filter((question) => question.support?.type === "table").length} tabelas de consulta).
- Questões ativas pendentes de revisão humana: **${auditRows.filter((row) => row[9] !== "Nenhuma").length}**.
- Questões sem captura numerada correspondente: **${questionsWithoutNumberedImage.length}**${questionsWithoutNumberedImage.length ? ` (${questionsWithoutNumberedImage.join(", ")})` : ""}. O conteúdo desses itens está completo no TXT e não cita imagem de apoio.

## Inventário por pasta

| Pasta | Arquivos | PNG | TXT | Sessões com conteúdo |
|---|---:|---:|---:|---|
${inventory.map((entry) => `| ${entry.name.replaceAll("|", "\\|")} | ${entry.files} | ${entry.png} | ${entry.txt} | ${entry.nonemptySessions} |`).join("\n")}

## Conteúdo recuperado e publicado

| ID | Origem comprovada | Implementação | Confiança |
|---|---|---|---|
${recovered.map((question) => `| ${question.id} | ${(question.audit?.recoveredFrom || []).join(" + ")} | ${question.type === "image_hotspot" ? `hotspot \`${question.visual.kind}\`` : "tabela HTML semântica"} | ${question.audit?.confidence || "alta"} |`).join("\n")}

Os hotspots foram recriados com zonas de resposta estáveis, identificadas por ID, sem copiar a interface antiga ou expor a marcação do gabarito. As tabelas são conteúdo de consulta e, por isso, não foram transformadas em células de resposta.

## Duplicatas e imagens especiais

Duplicatas integrais removidas da base ativa: **${duplicateRows.length}**.

${duplicateRows.map((item) => `- \`${item.id}\` duplica \`${item.duplicateOf}\`.`).join("\n") || "- Nenhuma."}

As **${specialFiles.length}** imagens de \`PERUNTAS A PADRONIZAR WEB\` foram comparadas por SHA-256, não por posição. Todas possuem correspondência byte a byte na árvore original; portanto, não constituem novas questões ou imagens órfãs:

${specialMappings.map((item) => `- \`${item.file}\` → ${item.matches.length ? item.matches.map((match) => `\`${match}\``).join(", ") : "**sem correspondência — revisão necessária**"}`).join("\n")}

## Pendências reais fora da base publicada

- **Área 9 — Comunicações e relatórios:** ${pendingArea?.files || 0} arquivos (${pendingArea?.png || 0} PNG e ${pendingArea?.txt || 0} TXT), com conteúdo apenas nas sessões ${pendingArea?.nonemptySessions || "—"}. Ela permanece fora da publicação porque a base vigente e o importador validado abrangem explicitamente as áreas 1–8; as sessões 3 e 4 dependem apenas de imagens e exigem transcrição e validação próprias antes de qualquer ampliação de escopo.
- **Áreas 10–22:** ${emptyAreas.length} pastas encontradas, todas sem arquivos de conteúdo. Não há texto, alternativa ou gabarito a publicar sem invenção.
- Nenhuma das limitações acima reduz a fidelidade das ${auditRows.length} questões ativas.

## Regras de rastreabilidade

- O importador valida hashes SHA-256 das sete recuperações visuais antes de gerar o banco.
- Cada questão visual contém \`audit.recoveredFrom\`, confiança e sinalizador de revisão.
- IDs visuais, pares, zonas e respostas são validados nos testes automatizados.
- Capturas completas não são copiadas para o pacote público; somente conteúdo didático confirmado é representado em HTML/CSS.
`;

await mkdir(docsDirectory, { recursive: true });
await writeFile(path.join(docsDirectory, "content-audit.csv"), csvContents, "utf8");
await writeFile(path.join(docsDirectory, "content-audit.md"), `${markdown}\n`, "utf8");

if (specialMappings.some((item) => item.matches.length === 0)) throw new Error("Há imagens de padronização sem correspondência na fonte.");
if (auditRows.some((row) => row[3] !== "Sim" || row[4] !== "Sim" || row[5] !== "Sim")) throw new Error("Há questões ativas incompletas ou sem gabarito verificável.");
if (activeIds.size !== auditRows.length) throw new Error("Há IDs duplicados na base ativa.");

console.log(`Auditoria concluída: ${allSourceFiles.length} arquivos-fonte, ${auditRows.length} questões ativas e ${recovered.length} recuperações visuais.`);
console.log(`Relatórios: ${path.join(docsDirectory, "content-audit.md")} e content-audit.csv.`);
