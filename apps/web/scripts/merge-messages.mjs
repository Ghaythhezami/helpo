// Merges messages/parts/<area>.en.json and <area>.ar.json into messages/en.json and ar.json (adds or overwrites keys).
// Idempotent: run it after editing a part file. Part files stay in the repo as the per-area source of the v8 keys.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");
const parts = join(root, "parts");
for (const locale of ["en", "ar"]) {
  const target = join(root, `${locale}.json`);
  const raw = readFileSync(target, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const base = JSON.parse(raw);
  if (existsSync(parts)) {
    for (const file of readdirSync(parts).filter((f) => f.endsWith(`.${locale}.json`)).sort()) {
      Object.assign(base, JSON.parse(readFileSync(join(parts, file), "utf8")));
    }
  }
  const removeFile = join(parts, "remove.json");
  if (existsSync(removeFile)) for (const key of JSON.parse(readFileSync(removeFile, "utf8"))) delete base[key];
  writeFileSync(target, JSON.stringify(base, null, 2).replace(/\n/g, eol) + eol);
}
console.log("messages merged");
