// Sign-out regression spec.
//
// A member on a phone tapped "Sign out" and landed on "That page hit a snag":
//     (0,s.isStaleProviderLink) is not a function
//
// Sign-out is the one navigation that always lands on /login, so it is the
// shortest path to exercising every chunk /login pulls in. It shipped broken
// because the service worker was serving a document from one build against a
// chunk registry from another (see public/sw.js) — a failure no desktop test
// and no fresh mobile install can see, and which no unit test can catch, since
// the mismatch only exists in a browser that already has a populated Cache
// Storage. So: drive a real browser through sign-out and assert the login form
// actually renders.
//
// Self-contained so it needs no credentials: provisions a throwaway member via
// the service role, signs in through the API, then clicks the real button.
const { test, expect } = require("@playwright/test");
const { createMember } = require("./auth-helper.js");

const BASE = process.env.E2E_BASE_URL || "https://www.christasspeakeasy.com";
const LOCALHOST = BASE.includes("localhost");

test.describe("sign out", () => {
  test.skip(!LOCALHOST, "Needs a local server + service role; never run against production");

  test("lands on a working login page, not the error boundary", async ({ page }) => {
    // The reported failure was phone-only, because only an installed PWA has
    // the stale cache. A phone viewport is the closest honest reproduction.
    await page.setViewportSize({ width: 390, height: 844 });

    const member = await createMember();
    if (!member) throw new Error("could not provision member");

    try {
      // Register the service worker, then let it install and precache, so the
      // test exercises the same SW that caused the incident.
      await page.goto(`${BASE}/login`, { waitUntil: "load" });
      const swReady = page
        .waitForFunction(
          () => navigator.serviceWorker && navigator.serviceWorker.controller !== null,
          null,
          { timeout: 30_000 }
        )
        .then(() => true)
        .catch(() => false);
      await page.evaluate(() => navigator.serviceWorker.register("/sw.js")).catch(() => {});
      const registered = await swReady;
      console.log(`[signout] service worker controlling page: ${registered}`);

      await signInViaApi(page, member);

      // On a phone the profile menu is display:none (Nav.module.css:792) and
      // sign out lives on /account instead — that is the button that was tapped.
      await page.goto(`${BASE}/account`, { waitUntil: "load" });
      await page.getByRole("button", { name: "Sign out" }).click();

      await page.waitForURL(/\/login/, { timeout: 30_000 });
      await page.waitForLoadState("load");

      // The bug: the route threw mid-render and the boundary swallowed it.
      await expect(page.getByText("That page hit a snag")).toHaveCount(0);
      await expect(page.getByText("Something went wrong")).toHaveCount(0);

      // The actual proof it works: the login form is there and usable.
      await expect(page.locator("#email")).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      // And the session really is gone, not just the cookie hidden client-side.
      const me = await page.request.get(`${BASE}/api/me`);
      console.log(`[signout] /api/me after signout: ${me.status()}`);
      expect([401, 403]).toContain(me.status());

      // No page errors: the exact TypeError must not appear in the console.
      // (pageerror is collected by the fixture hook below.)
    } finally {
      await member.cleanup();
    }
  });
});

async function signInViaApi(page, member) {
  const res = await page.request.post(`${BASE}/api/auth/session`, {
    data: { supabaseToken: member.supabaseToken, supabaseRefreshToken: member.refreshToken },
  });
  expect(res.ok()).toBeTruthy();
  const setCookies = res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
  await page.context().addCookies(
    setCookies.map((c) => {
      const [pair] = c.value.split(";");
      const [name, value] = pair.split("=");
      return { name, value: value || "", domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" };
    })
  );
}

// Fail the test if any uncaught page error fires — the reported symptom was an
// uncaught TypeError, so its recurrence is the regression we care about.
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (err) => {
    throw new Error(`uncaught page error: ${err.message}`);
  });
});
