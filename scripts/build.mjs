import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectRoot, "dist");
const publicEntries = [
  "app.html",
  "assets",
  "css",
  "index.html",
  "js",
  "manifest.webmanifest",
  "offline.html",
  "sw.js"
];

if (path.dirname(outputDir) !== projectRoot || path.basename(outputDir) !== "dist") {
  throw new Error("Diretório de saída inválido.");
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const entry of publicEntries) {
  await cp(path.join(projectRoot, entry), path.join(outputDir, entry), {
    recursive: true
  });
}

console.log(`Build concluído em ${outputDir}`);
