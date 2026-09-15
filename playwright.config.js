// Playwright test configuration (JavaScript).
// Defaults to the PRODUCTION site so real user-perceived navigation cost is
// measured (this app is behind an auth wall — authed tests use real credentials
// from E2E_EMAIL / E2E_PASSWORD and are auto-skipped when absent).
// For a local run, set E2E_BASE_URL=http://localhost:3000 (or SCHEME/HOST) —
// the dev server is started automatically only in that mode.
const path = require("path");

function loadDotEnv() {
  const existing = { ...process.env };
  for (const file of [".env.local", ".env"]) {
    try {
      const { parse } = require("dotenv");
      const fs = require("fs");
      const abs = path.resolve(process.cwd(), file);
      if (fs.existsSync(abs)) Object.assign(process.env, parse(fs.readFileSync(abs)), {});
    } catch {}
  }
  return { ...process.env, ...existing };
}

const env = loadDotEnv();
const isLocal = env.E2E_BASE_URL && String(env.E2E_BASE_URL).includes("localhost");
const baseURL = env.E2E_BASE_URL || "https://www.christasspeakeasy.com";

module.exports = {
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 60_000,
  },
  webServer: isLocal
    ? {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
      }
    : undefined,
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
};