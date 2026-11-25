import { readFile, writeFile } from "node:fs/promises";

const serviceWorkerPath = new URL("../public/sw.js", import.meta.url);
const source = await readFile(serviceWorkerPath, "utf8");
const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || `local-${Date.now()}`;
const version = `release-${commit.slice(0, 12)}`;

if (!source.includes("__SERVICE_WORKER_VERSION__")) {
  throw new Error("Service worker version placeholder is missing; refusing to build with an unversioned cache.");
}

await writeFile(serviceWorkerPath, source.replace("__SERVICE_WORKER_VERSION__", version));
console.info(`Service worker cache namespace: ${version}`);
