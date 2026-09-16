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
  throw new Error("Uso: npm run import:knowledge -- --source <diretório-da-nova-base>");
}

const sourceDirectory = path.resolve(args[sourceFlag + 1]);
const maximumQuestionNumber = 15;

function parseAnswerKey(contents) {
  const answers = new Map();

  for (const match of contents.matchAll(/^(\d+)\s*-\s*([A-F](?:\s*,\s*[A-F])*)\s*$/gim)) {
    const number = Number(match[1]);
    if (number <= maximumQuestionNumber) {
      answers.set(number, match[2].split(",").map((answer) => answer.trim().toUpperCase()));
    }
  }

  if (answers.size === 0) throw new Error("Gabarito das Questões 1–15 não encontrado.");
  return answers;
}

function parseQuestions(contents) {
  const answerKeyIndex = contents.search(/^GABARITO\s*$/im);
  if (answerKeyIndex === -1) throw new Error("Marcador GABARITO ausente na nova base.");

  const questionSource = contents.slice(0, answerKeyIndex);
  const answerSource = contents.slice(answerKeyIndex);
  const answerKey = parseAnswerKey(answerSource);
  const allHeaders = [...questionSource.matchAll(/^Questão\s+(\d+)\s+de\s+(\d+)\s*$/gim)];
  const headers = allHeaders.filter((header) => Number(header[1]) <= maximumQuestionNumber);

  if (headers.length === 0) throw new Error("Nenhuma Questão entre 1 e 15 foi encontrada.");

  const expectedNumbers = Array.from({ length: headers.length }, (_, index) => index + 1);
  const actualNumbers = headers.map((header) => Number(header[1]));
  if (JSON.stringify(actualNumbers) !== JSON.stringify(expectedNumbers)) {
    throw new Error(`Numeração inválida na nova base: ${actualNumbers.join(", ")}.`);
  }
  if (answerKey.size !== headers.length) {
    throw new Error(`Encontradas ${headers.length} questões e ${answerKey.size} respostas entre 1 e 15.`);
  }

  return headers.map((header) => {
    const number = Number(header[1]);
    const sourceIndex = allHeaders.indexOf(header);
    const nextHeader = allHeaders[sourceIndex + 1];
    const blockStart = header.index + header[0].length;
    const blockEnd = nextHeader?.index ?? questionSource.length;
    const block = questionSource.slice(blockStart, blockEnd).trim();
    const optionMarkers = [...block.matchAll(/^([A-F])\.\s+(.+)$/gm)];

    if (optionMarkers.length < 2) throw new Error(`Questão ${number}: alternativas insuficientes.`);

    const question = block.slice(0, optionMarkers[0].index).trim();
    const options = optionMarkers.map((marker, optionIndex) => {
      const optionEnd = optionMarkers[optionIndex + 1]?.index ?? block.length;
      const firstLineEnd = marker.index + marker[0].length;
      const continuation = block.slice(firstLineEnd, optionEnd).trim();
      return {
        id: marker[1],
        text: [marker[2].trim(), continuation].filter(Boolean).join("\n")
      };
    });
    const answer = answerKey.get(number);
    const optionIds = new Set(options.map((option) => option.id));

    if (!question) throw new Error(`Questão ${number}: enunciado vazio.`);
    if (!answer?.every((item) => optionIds.has(item))) {
      throw new Error(`Questão ${number}: resposta ausente ou fora das alternativas.`);
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
      reference: "PMP - BOOK 8 — Fundamentos de gerenciamento de projetos e entrega de valor, sessão 1.",
      explanation: "Resposta conforme o gabarito do material de origem.",
      id: `fund-s1-q${number}`,
      source: "Sessão 1",
      title: "Sessão 1",
      session: 1
    };
  });
}

const sourceFiles = await readdir(sourceDirectory, { withFileTypes: true });
const answerFiles = sourceFiles.filter((file) => file.isFile() && /^Gabarito.*\.txt$/i.test(file.name));
if (answerFiles.length !== 1) {
  throw new Error(`Esperado um Gabarito TXT na nova base, encontrados ${answerFiles.length}.`);
}

const sourceContents = await readFile(path.join(sourceDirectory, answerFiles[0].name), "utf8");
const importedQuestions = parseQuestions(sourceContents.replace(/\r\n?/g, "\n"));

const context = { window: {} };
vm.runInNewContext(await readFile(questionBankPath, "utf8"), context);
const questionBank = context.window.PREPARAKEY_QUESTIONS;
const existingQuestionOne = questionBank?.areas?.[0]?.sessions
  ?.flatMap((session) => session.questions)
  .find((question) => question.id === "fund-s1-q1");

if (!existingQuestionOne) throw new Error("A Questão 1 pronta não foi encontrada no sistema.");

const importedQuestionOne = importedQuestions[0];
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

const finalQuestions = [existingQuestionOne, ...importedQuestions.slice(1)];
questionBank.simulados = [];
questionBank.areas = [
  {
    id: "fundamentos",
    title: "Fundamentos de Gerenciamento de Projetos",
    sessions: [
      {
        id: "fund-s1",
        number: 1,
        title: "Sessão 1",
        questions: finalQuestions,
        available: true,
        note: ""
      }
    ]
  }
];
questionBank.missingSessions = [];
questionBank.generatedAt = "2026-09-16";

await writeFile(
  questionBankPath,
  `window.PREPARAKEY_QUESTIONS = ${JSON.stringify(questionBank, null, 2)};\n`,
  "utf8"
);

console.log(
  `Nova base aplicada: Questão 1 preservada e ${finalQuestions.length - 1} questões importadas (total ${finalQuestions.length}).`
);
