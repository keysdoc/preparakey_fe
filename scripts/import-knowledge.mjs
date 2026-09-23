import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const questionBankPath = path.join(projectRoot, "js", "questions.js");
const args = process.argv.slice(2);
const sourceFlag = args.indexOf("--source");

if (sourceFlag === -1 || !args[sourceFlag + 1]) {
  throw new Error("Uso: npm run import:knowledge -- --source <diretório-PMP-BOOK-8>");
}

const sourceRoot = path.resolve(args[sourceFlag + 1]);
const sessionNumbers = Array.from({ length: 16 }, (_, index) => index + 1);
const areas = [
  { number: 1, id: "fundamentos", prefix: "fund", folder: "1. Fundamentos de gerenciamento de projetos e entrega de valor" },
  { number: 2, id: "ambiente-projeto", prefix: "area2", folder: "2. Ambiente do projeto, contexto organizacional, governança e PMO" },
  { number: 3, id: "abordagens-desenvolvimento", prefix: "area3", folder: "3. Abordagens de desenvolvimento, ciclo de vida e adaptação" },
  { number: 4, id: "lideranca-gerente", prefix: "area4", folder: "4. Mentalidade, papel do gerente de projetos e liderança" },
  { number: 5, id: "lideranca-equipe", prefix: "area5", folder: "5. Visão comum, liderança da equipe e conflitos" },
  { number: 6, id: "iniciacao-projeto", prefix: "area6", folder: "6. Iniciação do projeto e termo de abertura" }
];
const expectedActiveCounts = [132, 148, 184, 125, 137, 55];
const matchingOverrides = new Map([
  ["3-12-3", {
    hash: "ca71255c0090cd929c44a49ad17828b2b5b744d4f2c0b278d9c603b8b7910fbf",
    pairs: [
      ["Discutir os melhoramentos que podem ser feitos em sprints subsequentes", "Retrospectiva de Sprint"],
      ["Apresentar o desempenho do projeto para as partes interessadas", "Revisão de Sprint"],
      ["Verificar o progresso em direção à meta do sprint", "Execução de Sprint"],
      ["Fornecer estimativas de esforço necessárias para completar histórias de usuário", "Planejamento de Sprint"]
    ]
  }],
  ["3-12-7", {
    hash: "be27e3a5703adf373057977a9918f1721b2e857fc2cdbedeb8b549ce1fca812f",
    pairs: [
      ["Ágil", "Backlog do Produto"],
      ["Preditivo", "Relatórios de Desempenho do Trabalho"],
      ["Ágil", "Gráfico Burnup"]
    ]
  }],
  ["3-12-9", {
    hash: "beda297a24e51d832533b630bf2cc6e02586e04a44296ebd6820e93d2ce9a489",
    pairs: [
      ["Iterativo", "Os requisitos dinâmicos são repetidos sobre o trabalho inacabado para melhorá-lo e modificá-lo até que estejam corretos, mas entregues apenas uma vez."],
      ["Preditivo", "A maior parte do planejamento ocorre antecipadamente. A equipe se esforça para identificar o máximo de detalhes possível sobre os requisitos desde o início."],
      ["Incremental", "Os requisitos dinâmicos são executados uma vez para cada incremento, com entregas menores e frequentes."]
    ]
  }]
]);
const hotAreaHashes = new Map([
  ["5-12-3", "37d3e2f740461c6230520710e4fa740b3f6b1b1060f4dddd673f00e739cf9e6c"],
  ["5-13-7", "682982be60648d7d1da8c1957531e730422eec05d0ab1db04d23a49b0bee5769"]
]);

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeBlock(value) {
  return value.replace(/\r\n?/g, "\n").trim();
}

function normalizeFingerprintText(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

function questionFingerprint(question) {
  return JSON.stringify({
    type: question.type,
    question: normalizeFingerprintText(question.question),
    options: (question.options || []).map((option) => [option.id, normalizeFingerprintText(option.text)]),
    pairs: (question.pairs || []).map((pair) => [normalizeFingerprintText(pair.left), normalizeFingerprintText(pair.right)]),
    answer: question.answer || []
  });
}

function parseAnswerKey(contents, areaNumber, sessionNumber) {
  const answers = new Map();

  for (const match of contents.matchAll(/^(\d+)\s*-\s*(.+?)\s*$/gm)) {
    const number = Number(match[1]);
    const rawAnswer = match[2].trim();

    if (/^[A-F](?:\s*,\s*[A-F])*$/i.test(rawAnswer)) {
      answers.set(number, {
        type: "options",
        value: rawAnswer.split(",").map((answer) => answer.trim().toUpperCase())
      });
    } else if (/^Combine os Itens$/i.test(rawAnswer)) {
      answers.set(number, { type: "matching", value: ["Combine os Itens"] });
    } else if (/^Hot Area$/i.test(rawAnswer)) {
      answers.set(number, { type: "hot-area", value: ["Hot Area"] });
    } else {
      throw new Error(`Área ${areaNumber}, sessão ${sessionNumber}, questão ${number}: gabarito não reconhecido: ${rawAnswer}.`);
    }
  }

  if (answers.size === 0) throw new Error(`Área ${areaNumber}, sessão ${sessionNumber}: gabarito não encontrado.`);
  return answers;
}

function parseMatching(block, areaNumber, sessionNumber, questionNumber) {
  const key = `${areaNumber}-${sessionNumber}-${questionNumber}`;
  const sections = block.split(/\n\s*\n/).map((section) => section.trim()).filter(Boolean);
  const override = matchingOverrides.get(key);

  if (override) {
    if (hash(block) !== override.hash) throw new Error(`Área ${areaNumber}, sessão ${sessionNumber}, questão ${questionNumber}: fonte de associação alterada.`);
    return {
      question: sections.slice(0, -1).join("\n\n").trim(),
      pairs: override.pairs.map(([left, right]) => ({ left, right }))
    };
  }

  const lines = block.split("\n");
  let pairStart = lines.length;
  while (pairStart > 0 && /^.+:\s*.+$/.test(lines[pairStart - 1].trim())) pairStart -= 1;
  const pairLines = lines.slice(pairStart).map((line) => line.trim()).filter(Boolean);
  const question = lines.slice(0, pairStart).join("\n").trim();

  let pairs;
  if (pairLines.length >= 4 && pairLines.every((line, index) => index % 2 === 0 ? /^Abordagem:\s*.+/i.test(line) : /^Objetivo:\s*.+/i.test(line))) {
    pairs = [];
    for (let index = 0; index < pairLines.length; index += 2) {
      pairs.push({
        left: pairLines[index].replace(/^Abordagem:\s*/i, "").trim(),
        right: pairLines[index + 1].replace(/^Objetivo:\s*/i, "").trim()
      });
    }
  } else if (pairLines.length >= 2 && pairLines.every((line) => line.includes(":"))) {
    pairs = pairLines.map((line) => {
      const separator = line.indexOf(":");
      return { left: line.slice(0, separator).trim(), right: line.slice(separator + 1).trim() };
    });
  } else {
    throw new Error(`Área ${areaNumber}, sessão ${sessionNumber}, questão ${questionNumber}: associações sem estrutura reconhecida.`);
  }

  if (!question || pairs.length < 2 || pairs.some((pair) => !pair.left || !pair.right)) {
    throw new Error(`Área ${areaNumber}, sessão ${sessionNumber}, questão ${questionNumber}: associação incompleta.`);
  }
  return { question, pairs };
}

function parseQuestions(contents, area, sessionNumber, sourceFileName) {
  const answerKeyIndex = contents.search(/^GABARITO\s*$/im);
  if (answerKeyIndex === -1) throw new Error(`Área ${area.number}, sessão ${sessionNumber}: marcador GABARITO ausente.`);

  const questionSource = contents.slice(0, answerKeyIndex);
  const answerSource = contents.slice(answerKeyIndex);
  const answerKey = parseAnswerKey(answerSource, area.number, sessionNumber);
  const headers = [...questionSource.matchAll(/^Questão\s+(\d+)\s+de\s+(\d+)\s*$/gim)];

  if (headers.length === 0) throw new Error(`Área ${area.number}, sessão ${sessionNumber}: nenhuma questão encontrada.`);

  const declaredTotals = new Set(headers.map((header) => Number(header[2])));
  const declaredTotal = Number(headers[0][2]);
  const expectedNumbers = Array.from({ length: declaredTotal }, (_, index) => index + 1);
  const actualNumbers = headers.map((header) => Number(header[1]));

  if (declaredTotals.size !== 1 || headers.length !== declaredTotal || JSON.stringify(actualNumbers) !== JSON.stringify(expectedNumbers)) {
    throw new Error(`Área ${area.number}, sessão ${sessionNumber}: numeração inválida; declarado ${declaredTotal}, encontrado ${actualNumbers.join(", ")}.`);
  }
  if (answerKey.size !== declaredTotal) {
    throw new Error(`Área ${area.number}, sessão ${sessionNumber}: esperado ${declaredTotal}, encontrado ${answerKey.size} respostas.`);
  }

  return headers.map((header, index) => {
    const number = Number(header[1]);
    const nextHeader = headers[index + 1];
    const blockStart = header.index + header[0].length;
    const blockEnd = nextHeader?.index ?? questionSource.length;
    const block = normalizeBlock(questionSource.slice(blockStart, blockEnd));
    const answerEntry = answerKey.get(number);
    const sourceKey = `${area.number}-${sessionNumber}-${number}`;

    if (!answerEntry) throw new Error(`Área ${area.number}, sessão ${sessionNumber}, questão ${number}: resposta ausente.`);
    if (answerEntry.type === "hot-area") {
      if (hotAreaHashes.get(sourceKey) !== hash(block)) {
        throw new Error(`Área ${area.number}, sessão ${sessionNumber}, questão ${number}: Hot Area inesperada ou alterada.`);
      }
      return { skipped: "hot-area", area: area.number, session: sessionNumber, number };
    }

    let type;
    let question;
    let options = [];
    let pairs = [];
    const answer = answerEntry.value;
    let required;

    if (answerEntry.type === "matching") {
      const matching = parseMatching(block, area.number, sessionNumber, number);
      type = "matching";
      question = matching.question;
      pairs = matching.pairs;
      required = pairs.length;
    } else {
      const optionMarkers = [...block.matchAll(/^([A-F])\.\s+(.+)$/gm)];
      if (optionMarkers.length < 2) {
        throw new Error(`Área ${area.number}, sessão ${sessionNumber}, questão ${number}: alternativas insuficientes.`);
      }

      question = block.slice(0, optionMarkers[0].index).trim();
      options = optionMarkers.map((marker, optionIndex) => {
        const optionEnd = optionMarkers[optionIndex + 1]?.index ?? block.length;
        const firstLineEnd = marker.index + marker[0].length;
        const continuation = block.slice(firstLineEnd, optionEnd).trim();
        return { id: marker[1], text: [marker[2].trim(), continuation].filter(Boolean).join("\n") };
      });

      const optionIds = new Set(options.map((option) => option.id));
      if (!question) throw new Error(`Área ${area.number}, sessão ${sessionNumber}, questão ${number}: enunciado vazio.`);
      if (!answer.every((item) => optionIds.has(item))) {
        throw new Error(`Área ${area.number}, sessão ${sessionNumber}, questão ${number}: resposta fora das alternativas.`);
      }

      type = answer.length > 1 ? "multiple" : "single";
      required = answer.length;
    }

    return {
      number,
      type,
      question,
      options,
      pairs,
      answer,
      required,
      area: area.folder,
      domain: "",
      reference: `PMP - BOOK 8/${area.folder}/${sessionNumber}/${sourceFileName}`,
      explanation: "",
      id: `${area.prefix}-s${sessionNumber}-q${number}`,
      source: `${area.folder}/${sessionNumber}`,
      title: `Sessão ${sessionNumber}`,
      session: sessionNumber
    };
  });
}

async function importSession(area, sessionNumber) {
  const sessionDirectory = path.join(sourceRoot, area.folder, String(sessionNumber));
  const sourceFiles = await readdir(sessionDirectory, { withFileTypes: true });
  const answerFiles = sourceFiles
    .filter((file) => file.isFile() && /^Ga(?:b|nb)arito.*\.txt$/i.test(file.name))
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

  if (answerFiles.length === 0) throw new Error(`Área ${area.number}, sessão ${sessionNumber}: nenhum Gabarito TXT encontrado.`);

  const candidateContents = await Promise.all(answerFiles.map(async (file) => ({
    name: file.name,
    contents: (await readFile(path.join(sessionDirectory, file.name), "utf8")).replace(/\r\n?/g, "\n")
  })));
  if (new Set(candidateContents.map((candidate) => candidate.contents)).size !== 1) {
    throw new Error(`Área ${area.number}, sessão ${sessionNumber}: Gabaritos TXT conflitantes: ${answerFiles.map((file) => file.name).join(", ")}.`);
  }

  const source = candidateContents[0];
  return {
    id: `${area.prefix}-s${sessionNumber}`,
    number: sessionNumber,
    title: `Sessão ${sessionNumber}`,
    questions: parseQuestions(source.contents, area, sessionNumber, source.name),
    available: true,
    note: ""
  };
}

const context = { window: {} };
vm.runInNewContext(await readFile(questionBankPath, "utf8"), context);
const questionBank = context.window.PREPARAKEY_QUESTIONS;
if (!questionBank?.areas?.[0] || !Array.isArray(questionBank.simulados)) throw new Error("Banco atual inválido.");

const existingAreaOne = questionBank.areas[0];
const existingAreaOneQuestions = new Map(existingAreaOne.sessions.flatMap((session) => session.questions).map((question) => [question.id, question]));
const comparableFields = (question) => ({
  number: question.number,
  type: question.type,
  question: question.question,
  options: question.options || [],
  pairs: question.pairs || [],
  answer: question.answer,
  required: question.required
});

const importedAreas = [];
const skippedHotAreas = [];
const skippedDuplicates = [];
const seenFingerprints = new Map();

for (const area of areas) {
  const sessions = [];
  for (const sessionNumber of sessionNumbers) sessions.push(await importSession(area, sessionNumber));

  for (const session of sessions) {
    const activeQuestions = [];
    for (const entry of session.questions) {
      if (entry.skipped === "hot-area") {
        skippedHotAreas.push(entry);
        continue;
      }

      const fingerprint = questionFingerprint(entry);
      if (seenFingerprints.has(fingerprint)) {
        skippedDuplicates.push({ id: entry.id, duplicateOf: seenFingerprints.get(fingerprint) });
        continue;
      }

      let question = entry;
      if (area.number === 1) {
        const existing = existingAreaOneQuestions.get(entry.id);
        if (!existing || JSON.stringify(comparableFields(existing)) !== JSON.stringify(comparableFields(entry))) {
          throw new Error(`A questão existente ${entry.id} diverge da fonte; importação interrompida para preservá-la.`);
        }
        question = existing;
      }

      seenFingerprints.set(fingerprint, question.id);
      activeQuestions.push(question);
    }
    session.questions = activeQuestions;
  }

  importedAreas.push({ id: area.id, title: area.folder, sessions });
}

const activeCounts = importedAreas.map((area) => area.sessions.reduce((total, session) => total + session.questions.length, 0));
if (JSON.stringify(activeCounts) !== JSON.stringify(expectedActiveCounts)) {
  throw new Error(`Totais inesperados após validação: ${activeCounts.join(", ")}. Duplicatas: ${JSON.stringify(skippedDuplicates)}.`);
}

questionBank.areas = importedAreas;
questionBank.missingSessions = [];
questionBank.generatedAt = "2026-09-23";
questionBank.contentSource = "PMP - BOOK 8, áreas 1–6";
questionBank.excludedUnsupported = skippedHotAreas;
questionBank.removedDuplicates = skippedDuplicates;

await writeFile(questionBankPath, `window.PREPARAKEY_QUESTIONS = ${JSON.stringify(questionBank, null, 2)};\n`, "utf8");

const totalQuestions = activeCounts.reduce((total, count) => total + count, 0);
console.log(`Base aplicada no fluxo existente: ${importedAreas.length} áreas, 96 sessões e ${totalQuestions} questões compatíveis.`);
console.log(`Duplicatas integrais removidas: ${skippedDuplicates.length}. Hot Area sem componente compatível: ${skippedHotAreas.length}.`);
