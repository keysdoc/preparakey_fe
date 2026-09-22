import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(projectRoot, "js", "book8.js");
const args = process.argv.slice(2);
const sourceFlag = args.indexOf("--source");

if (sourceFlag === -1 || !args[sourceFlag + 1]) {
  throw new Error("Uso: npm run import:book8 -- --source <diretório-PMP-BOOK-8>");
}

const sourceRoot = path.resolve(args[sourceFlag + 1]);
const allowedAreas = [
  "1. Fundamentos de gerenciamento de projetos e entrega de valor",
  "2. Ambiente do projeto, contexto organizacional, governança e PMO",
  "3. Abordagens de desenvolvimento, ciclo de vida e adaptação",
  "4. Mentalidade, papel do gerente de projetos e liderança",
  "5. Visão comum, liderança da equipe e conflitos",
  "6. Iniciação do projeto e termo de abertura"
];

function normalized(value) {
  return value.replace(/\r\n?/g, "\n").trim();
}

function parseAnswerKey(contents, sourceLabel) {
  const answers = new Map();

  for (const match of contents.matchAll(/^(\d+)\s*-\s*(.+?)\s*$/gm)) {
    answers.set(Number(match[1]), match[2].trim());
  }

  if (!answers.size) throw new Error(`${sourceLabel}: gabarito não encontrado.`);
  return answers;
}

function parseQuestions(contents, areaNumber, sessionNumber, sourceLabel) {
  const answerKeyIndex = contents.search(/^GABARITO\s*$/im);
  if (answerKeyIndex === -1) throw new Error(`${sourceLabel}: marcador GABARITO ausente.`);

  const questionSource = contents.slice(0, answerKeyIndex);
  const answerKey = parseAnswerKey(contents.slice(answerKeyIndex), sourceLabel);
  const headers = [...questionSource.matchAll(/^Questão\s+(\d+)\s+de\s+(\d+)\s*$/gim)];

  if (!headers.length) throw new Error(`${sourceLabel}: nenhuma questão encontrada.`);

  const declaredTotal = Number(headers[0][2]);
  const actualNumbers = headers.map((header) => Number(header[1]));
  const expectedNumbers = Array.from({ length: declaredTotal }, (_, index) => index + 1);
  const totals = new Set(headers.map((header) => Number(header[2])));

  if (
    totals.size !== 1 ||
    headers.length !== declaredTotal ||
    JSON.stringify(actualNumbers) !== JSON.stringify(expectedNumbers) ||
    answerKey.size !== declaredTotal
  ) {
    throw new Error(`${sourceLabel}: numeração ou gabarito inconsistente.`);
  }

  return headers.map((header, index) => {
    const number = Number(header[1]);
    const nextHeader = headers[index + 1];
    const blockStart = header.index + header[0].length;
    const blockEnd = nextHeader?.index ?? questionSource.length;
    const block = questionSource.slice(blockStart, blockEnd).trim();
    const optionMarkers = [...block.matchAll(/^([A-F])\.\s+(.+)$/gm)];
    const optionA = optionMarkers.find((marker) => marker[1].toUpperCase() === "A");
    const answerKeyValue = answerKey.get(number);
    let question = block;
    let option1 = answerKeyValue;
    let optionKind = /^Hot Area$/i.test(answerKeyValue) ? "hot-area" : "matching";

    if (optionA) {
      const optionIndex = optionMarkers.indexOf(optionA);
      const optionEnd = optionMarkers[optionIndex + 1]?.index ?? block.length;
      const firstLineEnd = optionA.index + optionA[0].length;
      const continuation = block.slice(firstLineEnd, optionEnd).trim();
      question = block.slice(0, optionA.index).trim();
      option1 = [optionA[2].trim(), continuation].filter(Boolean).join("\n");
      optionKind = "text";
    }

    if (!question || !option1) throw new Error(`${sourceLabel}, questão ${number}: conteúdo incompleto.`);

    return {
      id: `book8-a${areaNumber}-s${sessionNumber}-q${number}`,
      session: sessionNumber,
      number,
      declaredTotal,
      question,
      option1,
      optionKind,
      source: `${areaNumber}/${sessionNumber}/${path.basename(sourceLabel)}`
    };
  });
}

async function importArea(areaName, areaIndex) {
  const areaNumber = areaIndex + 1;
  const areaPath = path.join(sourceRoot, areaName);
  const entries = await readdir(areaPath, { withFileTypes: true });
  const sessionNumbers = entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => Number(entry.name))
    .sort((left, right) => left - right);

  if (!sessionNumbers.length) throw new Error(`${areaName}: nenhuma sessão numérica encontrada.`);

  const questions = [];
  const fingerprints = new Set();
  let duplicatesSkipped = 0;

  for (const sessionNumber of sessionNumbers) {
    const sessionPath = path.join(areaPath, String(sessionNumber));
    const files = await readdir(sessionPath, { withFileTypes: true });
    const answerFiles = files
      .filter((file) => file.isFile() && /^Ga(?:b|nb)arito.*\.txt$/i.test(file.name))
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

    if (!answerFiles.length) throw new Error(`${areaName}, sessão ${sessionNumber}: Gabarito TXT ausente.`);

    const candidates = await Promise.all(answerFiles.map(async (file) => ({
      name: file.name,
      contents: normalized(await readFile(path.join(sessionPath, file.name), "utf8"))
    })));

    if (new Set(candidates.map((candidate) => candidate.contents)).size !== 1) {
      throw new Error(`${areaName}, sessão ${sessionNumber}: gabaritos TXT conflitantes.`);
    }

    const sourceLabel = path.join(areaName, String(sessionNumber), candidates[0].name);
    for (const question of parseQuestions(candidates[0].contents, areaNumber, sessionNumber, sourceLabel)) {
      const fingerprint = normalized(`${question.question}\n${question.option1}`).toLocaleLowerCase("pt-BR");
      if (fingerprints.has(fingerprint)) {
        duplicatesSkipped++;
        continue;
      }
      fingerprints.add(fingerprint);
      questions.push(question);
    }
  }

  return {
    id: `book8-area-${areaNumber}`,
    number: areaNumber,
    title: areaName,
    questions,
    duplicatesSkipped
  };
}

const areas = [];
for (const [index, areaName] of allowedAreas.entries()) {
  areas.push(await importArea(areaName, index));
}

const book8 = {
  id: "pmp-book-8",
  title: "PMP - BOOK 8",
  source: "PMP - BOOK 8",
  limit: allowedAreas.at(-1),
  areas
};

await writeFile(outputPath, `window.PREPARAKEY_BOOK8 = ${JSON.stringify(book8, null, 2)};\n`, "utf8");

const totalQuestions = areas.reduce((total, area) => total + area.questions.length, 0);
console.log(`PMP - BOOK 8 importado: ${areas.length} áreas e ${totalQuestions} perguntas.`);
for (const area of areas) {
  console.log(`Área ${area.number}: ${area.questions.length} perguntas; ${area.duplicatesSkipped} duplicatas exatas ignoradas.`);
}
