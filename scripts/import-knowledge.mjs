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
  throw new Error("Uso: npm run import:knowledge -- --source <diretório-das-sessões>");
}

const sourceRoot = path.resolve(args[sourceFlag + 1]);
const sessionNumbers = Array.from({ length: 15 }, (_, index) => index + 1);

function parseAnswerKey(contents, sessionNumber) {
  const answers = new Map();

  for (const match of contents.matchAll(/^(\d+)\s*-\s*([A-F](?:\s*,\s*[A-F])*)\s*$/gim)) {
    answers.set(Number(match[1]), match[2].split(",").map((answer) => answer.trim().toUpperCase()));
  }

  if (answers.size === 0) throw new Error(`Sessão ${sessionNumber}: gabarito não encontrado.`);
  return answers;
}

function parseQuestions(contents, sessionNumber) {
  const answerKeyIndex = contents.search(/^GABARITO\s*$/im);
  if (answerKeyIndex === -1) throw new Error(`Sessão ${sessionNumber}: marcador GABARITO ausente.`);

  const questionSource = contents.slice(0, answerKeyIndex);
  const answerSource = contents.slice(answerKeyIndex);
  const answerKey = parseAnswerKey(answerSource, sessionNumber);
  const headers = [...questionSource.matchAll(/^Questão\s+(\d+)\s+de\s+(\d+)\s*$/gim)];

  if (headers.length === 0) throw new Error(`Sessão ${sessionNumber}: nenhuma questão encontrada.`);

  const declaredTotal = Number(headers[0][2]);
  if (headers.length !== declaredTotal || answerKey.size !== declaredTotal) {
    throw new Error(
      `Sessão ${sessionNumber}: esperado ${declaredTotal}, encontrado ${headers.length} questões e ${answerKey.size} respostas.`
    );
  }

  return headers.map((header, index) => {
    const number = Number(header[1]);
    const nextHeader = headers[index + 1];
    const blockStart = header.index + header[0].length;
    const blockEnd = nextHeader?.index ?? questionSource.length;
    const block = questionSource.slice(blockStart, blockEnd).trim();
    const optionMarkers = [...block.matchAll(/^([A-F])\.\s+(.+)$/gm)];

    if (optionMarkers.length < 2) {
      throw new Error(`Sessão ${sessionNumber}, questão ${number}: alternativas insuficientes.`);
    }

    const question = block.slice(0, optionMarkers[0].index).trim();
    const options = optionMarkers.map((marker, optionIndex) => {
      const optionEnd = optionMarkers[optionIndex + 1]?.index ?? block.length;
      const firstLineEnd = marker.index + marker[0].length;
      const continuation = block.slice(firstLineEnd, optionEnd).trim();
      const text = [marker[2].trim(), continuation].filter(Boolean).join("\n");
      return { id: marker[1], text };
    });
    const answer = answerKey.get(number);
    const optionIds = new Set(options.map((option) => option.id));

    if (!question) throw new Error(`Sessão ${sessionNumber}, questão ${number}: enunciado vazio.`);
    if (!answer) throw new Error(`Sessão ${sessionNumber}, questão ${number}: resposta ausente.`);
    if (!answer.every((item) => optionIds.has(item))) {
      throw new Error(`Sessão ${sessionNumber}, questão ${number}: resposta fora das alternativas.`);
    }

    return {
      number,
      type: answer.length > 1 ? "multiple" : "single",
      question,
      options,
      pairs: [],
      answer,
      required: answer.length,
      area: "Fundamentos de Gerenciamento de Projetos",
      domain: "Processo",
      reference: `PMP - BOOK 8 — Fundamentos de gerenciamento de projetos e entrega de valor, sessão ${sessionNumber}.`,
      explanation: "Resposta conforme o gabarito do material de origem.",
      id: `fund-s${sessionNumber}-q${number}`,
      source: `Sessão ${sessionNumber}`,
      title: `Sessão ${sessionNumber}`,
      session: sessionNumber
    };
  });
}

async function importSession(sessionNumber) {
  const sessionDirectory = path.join(sourceRoot, String(sessionNumber));
  const files = await readdir(sessionDirectory, { withFileTypes: true });
  const answerFiles = files.filter((file) => file.isFile() && /^Gabarito.*\.txt$/i.test(file.name));

  if (answerFiles.length !== 1) {
    throw new Error(`Sessão ${sessionNumber}: esperado um arquivo de gabarito TXT, encontrados ${answerFiles.length}.`);
  }

  const contents = await readFile(path.join(sessionDirectory, answerFiles[0].name), "utf8");
  const questions = parseQuestions(contents.replace(/\r\n?/g, "\n"), sessionNumber);

  return {
    id: `fund-s${sessionNumber}`,
    number: sessionNumber,
    title: `Sessão ${sessionNumber}`,
    questions,
    available: true,
    note: ""
  };
}

const context = { window: {} };
vm.runInNewContext(await readFile(questionBankPath, "utf8"), context);
const questionBank = context.window.PREPARAKEY_QUESTIONS;

if (!questionBank?.areas?.[0]?.sessions) throw new Error("Estrutura do banco de questões inválida.");

const importedSessions = [];
for (const sessionNumber of sessionNumbers) importedSessions.push(await importSession(sessionNumber));

const preservedSessions = questionBank.areas[0].sessions
  .filter((session) => session.number > 15)
  .sort((left, right) => left.number - right.number);

questionBank.areas[0].sessions = [...importedSessions, ...preservedSessions];
await writeFile(
  questionBankPath,
  `window.PREPARAKEY_QUESTIONS = ${JSON.stringify(questionBank, null, 2)};\n`,
  "utf8"
);

const importedCount = importedSessions.reduce((total, session) => total + session.questions.length, 0);
console.log(`Importadas ${importedCount} questões das sessões 1 a 15.`);
