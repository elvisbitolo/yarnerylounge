import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const modelNames = new Set([...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]));
const delegateNames = new Set(
  [...modelNames].map((name) => `${name[0].toLowerCase()}${name.slice(1)}`)
);

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "generated" || entry.name === "__tests__") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(fullPath));
    else if (/\.(js|mjs)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

test("Prisma delegate calls refer to models in the schema", () => {
  const offenders = [];
  for (const file of sourceFiles(path.join(root, "src"))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\b(?:tx|prisma)\.([a-z]\w*)\b/g)) {
      if (!delegateNames.has(match[1])) {
        offenders.push(`${path.relative(root, file)}: ${match[1]}`);
      }
    }
  }
  assert.deepEqual([...new Set(offenders)], []);
});
