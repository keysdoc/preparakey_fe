import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowDirectory = path.join(projectRoot, ".github", "workflows");
const workflowFiles = (await readdir(workflowDirectory))
  .filter((file) => /\.ya?ml$/i.test(file));

if (workflowFiles.length === 0) throw new Error("Nenhum workflow YAML encontrado.");

for (const file of workflowFiles) {
  const document = parseDocument(await readFile(path.join(workflowDirectory, file), "utf8"));

  if (document.errors.length > 0) {
    throw new Error(`${file}: ${document.errors.map((error) => error.message).join("; ")}`);
  }

  const workflow = document.toJS();
  if (!workflow.name || !workflow.on || !workflow.jobs) {
    throw new Error(`${file}: workflow sem name, on ou jobs.`);
  }

  console.log(`Workflow válido: ${file}`);
}
