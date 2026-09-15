import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".webmanifest",
  ".yaml",
  ".yml"
]);
const secretPatterns = [
  ["chave privada", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["token GitHub", /\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ["chave AWS", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["senha em JavaScript", /\bpassword\s*:\s*["'][^"']+["']/i],
  ["senha preenchida em HTML", /type=["']password["'][^>]*\bvalue=["'][^"']+["']/i]
];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolutePath));
    else if (textExtensions.has(path.extname(entry.name))) files.push(absolutePath);
  }

  return files;
}

const findings = [];

for (const file of await listFiles(projectRoot)) {
  const relativePath = path.relative(projectRoot, file);
  const contents = await readFile(file, "utf8");

  for (const [kind, pattern] of secretPatterns) {
    if (pattern.test(contents)) findings.push(`${relativePath}: ${kind}`);
  }
}

const rootEntries = await readdir(projectRoot, { withFileTypes: true });
for (const entry of rootEntries) {
  if (entry.isFile() && entry.name.startsWith(".env") && entry.name !== ".env.example") {
    findings.push(`${entry.name}: arquivo de ambiente não permitido no repositório`);
  }
}

if (findings.length > 0) {
  throw new Error(`Possíveis segredos encontrados:\n${findings.join("\n")}`);
}

console.log("Nenhum padrão de segredo conhecido foi encontrado.");
