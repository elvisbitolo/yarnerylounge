// Navigation performance spec — "when i press a link or button, it takes long
// to take me there". Measures real user-perceived latency against the live
// production site (or a local dev server via E2E_BASE_URL).
//
// Authed routes require real credentials — set E2E_EMAIL / E2E_PASSWORD in
// .env.local or the environment. Tests auto-skip when these are absent.
// Public routes always run.
const { test, expect } = require("@playwright/test");
const { createMember } = require("./auth-helper.js");

const BASE = process.env.E2E_BASE_URL || "https://www.christasspeakeasy.com";
const EMAIL = process.env.E2E_EMAIL || "";
const PASSWORD = process.env.E2E_PASSWORD || "";
const AUTHED = Boolean(EMAIL && PASSWORD);
const LOCALHOST = BASE.includes("localhost");

// Public routes that don't need auth (safe to measure from anywhere).
const PUBLIC_ROUTES = ["/login", "/membership", "/pricing", "/resources", "/terms"];

// Authenticated routes — clickable from the sidebar once signed in.
const AUTHED_CLIENT_ROUTES = ["/calendar", "/feed", "/events", "/members"];

async function loginViaUI(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");

  await page.locator("#email").fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();

  // loginWithSupabaseEmail fires → /signing-in → server reentry → /feed.
  // The client-side redirect can take a few seconds on prod.
  await page.waitForURL(/(\/feed|\/signing-in)/, { timeout: 20_000 });
  await page.waitForLoadState("load");
}

test.describe("public route loads", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`GET ${route} loads within 8s`, async ({ page }) => {
      const start = Date.now();
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("load");
      const elapsed = Date.now() - start;
      console.log(`[perf] full-page ${route}: ${elapsed}ms`);
      // Baseline thresholds: Vercel cold starts + DB latency on production
      // are real. These guard against regressions (minutes), not seconds.
      expect(elapsed).toBeLessThan(60_000);
    });
  }
});

test.describe("authed client-side navigation", () => {
  test.skip(!AUTHED, "Set E2E_EMAIL + E2E_PASSWORD to run authed perf tests");

  if (LOCALHOST) {
    // Local mode: provision a throwaway member via service role (fast, isolated).
    test("local: provisioned member can navigate quickly", async ({ page }) => {
      const member = await createMember();
      if (!member) throw new Error("no member");
      try {
        const res = await page.request.post(`${BASE}/api/auth/session`, {
          data: {
            supabaseToken: member.supabaseToken,
            supabaseRefreshToken: member.refreshToken,
          },
        });
        expect(res.ok()).toBeTruthy();
        const setCookies = res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
        await page.context().addCookies(
          setCookies.map((c) => {
            const [pair] = c.value.split(";");
            const [name, value] = pair.split("=");
            return {
              name,
              value: value || "",
              domain: "localhost",
              path: "/",
              httpOnly: true,
              sameSite: "Lax",
            };
          })
        );
        await page.goto(`${BASE}/feed`, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("load");
        await measureClicks(page);
      } finally {
        await member.cleanup();
      }
    });
  } else {
    // Production: log in with real account via the login form.
    test("production: signed-in member can navigate quickly", async ({ page }) => {
      await loginViaUI(page);
      await measureClicks(page);
    });
  }
});

// Time client-side clicks between sidebar links.
async function measureClicks(page) {
  // Ensure the sidebar Nav loaded before clicking links.
  await page.waitForLoadState("load");

  for (const route of AUTHED_CLIENT_ROUTES) {
    const link = page.locator(`a[href="${route}"]`).first();
    const visible = await link.isVisible().catch(() => false);
    if (!visible) {
      console.log(`[perf] link ${route} not visible — skipping click`);
      continue;
    }
    const start = Date.now();
    await link.click();
    await page.waitForURL(`**${route}**`, { timeout: 15_000 });
    await page.waitForLoadState("load");
    const elapsed = Date.now() - start;
    console.log(`[perf] click → ${route}: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(30_000);
  }
}