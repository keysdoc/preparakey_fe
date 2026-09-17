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
  throw new Error("Uso: npm run import:knowledge -- --source <diretório-das-sessões-1-a-16>");
}

const sourceRoot = path.resolve(args[sourceFlag + 1]);
const sessionNumbers = Array.from({ length: 16 }, (_, index) => index + 1);

function parseAnswerKey(contents, sessionNumber) {
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
    } else {
      throw new Error(`Sessão ${sessionNumber}, questão ${number}: gabarito não reconhecido: ${rawAnswer}.`);
    }
  }

  if (answers.size === 0) throw new Error(`Sessão ${sessionNumber}: gabarito não encontrado.`);
  return answers;
}

function parseMatching(block, sessionNumber, questionNumber) {
  const pairPattern = /^Abordagem:\s*(.+)\nObjetivo:\s*(.+)$/gm;
  const pairMatches = [...block.matchAll(pairPattern)];
  if (pairMatches.length < 2) {
    throw new Error(`Sessão ${sessionNumber}, questão ${questionNumber}: associações insuficientes.`);
  }

  const question = block.slice(0, pairMatches[0].index).trim();
  const pairs = pairMatches.map((match) => ({
    left: match[1].trim(),
    right: match[2].trim()
  }));

  if (!question) throw new Error(`Sessão ${sessionNumber}, questão ${questionNumber}: enunciado vazio.`);
  return { question, pairs };
}

function parseQuestions(contents, sessionNumber) {
  const answerKeyIndex = contents.search(/^GABARITO\s*$/im);
  if (answerKeyIndex === -1) throw new Error(`Sessão ${sessionNumber}: marcador GABARITO ausente.`);

  const questionSource = contents.slice(0, answerKeyIndex);
  const answerSource = contents.slice(answerKeyIndex);
  const answerKey = parseAnswerKey(answerSource, sessionNumber);
  const headers = [...questionSource.matchAll(/^Questão\s+(\d+)\s+de\s+(\d+)\s*$/gim)];

  if (headers.length === 0) throw new Error(`Sessão ${sessionNumber}: nenhuma questão encontrada.`);

  const declaredTotals = new Set(headers.map((header) => Number(header[2])));
  const declaredTotal = Number(headers[0][2]);
  const expectedNumbers = Array.from({ length: declaredTotal }, (_, index) => index + 1);
  const actualNumbers = headers.map((header) => Number(header[1]));

  if (
    declaredTotals.size !== 1 ||
    headers.length !== declaredTotal ||
    JSON.stringify(actualNumbers) !== JSON.stringify(expectedNumbers)
  ) {
    throw new Error(
      `Sessão ${sessionNumber}: numeração inválida; declarado ${declaredTotal}, encontrado ${actualNumbers.join(", ")}.`
    );
  }
  if (answerKey.size !== declaredTotal) {
    throw new Error(
      `Sessão ${sessionNumber}: esperado ${declaredTotal}, encontrado ${answerKey.size} respostas.`
    );
  }

  return headers.map((header, index) => {
    const number = Number(header[1]);
    const nextHeader = headers[index + 1];
    const blockStart = header.index + header[0].length;
    const blockEnd = nextHeader?.index ?? questionSource.length;
    const block = questionSource.slice(blockStart, blockEnd).trim();
    const answerEntry = answerKey.get(number);

    if (!answerEntry) throw new Error(`Sessão ${sessionNumber}, questão ${number}: resposta ausente.`);

    let type;
    let question;
    let options = [];
    let pairs = [];
    let answer = answerEntry.value;
    let required;

    if (answerEntry.type === "matching") {
      const matching = parseMatching(block, sessionNumber, number);
      type = "matching";
      question = matching.question;
      pairs = matching.pairs;
      required = pairs.length;
    } else {
      const optionMarkers = [...block.matchAll(/^([A-F])\.\s+(.+)$/gm)];
      if (optionMarkers.length < 2) {
        throw new Error(`Sessão ${sessionNumber}, questão ${number}: alternativas insuficientes.`);
      }

      question = block.slice(0, optionMarkers[0].index).trim();
      options = optionMarkers.map((marker, optionIndex) => {
        const optionEnd = optionMarkers[optionIndex + 1]?.index ?? block.length;
        const firstLineEnd = marker.index + marker[0].length;
        const continuation = block.slice(firstLineEnd, optionEnd).trim();
        return {
          id: marker[1],
          text: [marker[2].trim(), continuation].filter(Boolean).join("\n")
        };
      });

      const optionIds = new Set(options.map((option) => option.id));
      if (!question) throw new Error(`Sessão ${sessionNumber}, questão ${number}: enunciado vazio.`);
      if (!answer.every((item) => optionIds.has(item))) {
        throw new Error(`Sessão ${sessionNumber}, questão ${number}: resposta fora das alternativas.`);
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
      area: "Fundamentos de Gerenciamento de Projetos",
      domain: "Processo",
      reference: `PMP - BOOK 8 — Fundamentos de gerenciamento de projetos e entrega de valor, sessão ${sessionNumber}.`,
      explanation: type === "matching"
        ? "Associações conforme o gabarito do material de origem."
        : "Resposta conforme o gabarito do material de origem.",
      id: `fund-s${sessionNumber}-q${number}`,
      source: `Sessão ${sessionNumber}`,
      title: `Sessão ${sessionNumber}`,
      session: sessionNumber
    };
  });
}

async function importSession(sessionNumber) {
  const sessionDirectory = path.join(sourceRoot, String(sessionNumber));
  const sourceFiles = await readdir(sessionDirectory, { withFileTypes: true });
  const answerFiles = sourceFiles.filter((file) => file.isFile() && /^Gabarito.*\.txt$/i.test(file.name));

  if (answerFiles.length !== 1) {
    throw new Error(
      `Sessão ${sessionNumber}: esperado um Gabarito TXT, encontrados ${answerFiles.length}.`
    );
  }

  const sourceContents = await readFile(path.join(sessionDirectory, answerFiles[0].name), "utf8");
  return {
    id: `fund-s${sessionNumber}`,
    number: sessionNumber,
    title: `Sessão ${sessionNumber}`,
    questions: parseQuestions(sourceContents.replace(/\r\n?/g, "\n"), sessionNumber),
    available: true,
    note: ""
  };
}

const importedSessions = [];
for (const sessionNumber of sessionNumbers) importedSessions.push(await importSession(sessionNumber));

const context = { window: {} };
vm.runInNewContext(await readFile(questionBankPath, "utf8"), context);
const questionBank = context.window.PREPARAKEY_QUESTIONS;
const existingQuestionOne = questionBank?.areas?.[0]?.sessions
  ?.flatMap((session) => session.questions)
  .find((question) => question.id === "fund-s1-q1");

if (!existingQuestionOne) throw new Error("A Questão 1 pronta não foi encontrada no sistema.");

const importedQuestionOne = importedSessions[0].questions[0];
const comparableFields = (question) => ({
  number: question.number,
  type: question.type,
  question: question.question,
  options: question.options,
  answer: question.answer,
  required: question.required
});
if (JSON.stringify(comparableFields(existingQuestionOne)) !== JSON.stringify(comparableFields(importedQuestionOne))) {
  throw new Error("A Questão 1 existente diverge da nova base; importação interrompida para preservá-la.");
}

importedSessions[0].questions[0] = existingQuestionOne;
questionBank.simulados = [];
questionBank.areas = [
  {
    id: "fundamentos",
    title: "Fundamentos de Gerenciamento de Projetos",
    sessions: importedSessions
  }
];
questionBank.missingSessions = [];
questionBank.generatedAt = "2026-09-16";

await writeFile(
  questionBankPath,
  `window.PREPARAKEY_QUESTIONS = ${JSON.stringify(questionBank, null, 2)};\n`,
  "utf8"
);

const totalQuestions = importedSessions.reduce((total, session) => total + session.questions.length, 0);
console.log(
  `Nova base aplicada: Questão 1 preservada, ${importedSessions.length} sessões e ${totalQuestions} questões.`
);
