// Members finder spec — "Find Members" must offer every filter through one
// "Find members by" disclosure.
//
// The card used to show Location, Hobbies, Timezone and Crafts permanently and
// hide Yarn story / Your makes / Crochet love quiz behind a "More filters"
// button. That split one job across two tiers and left a member who set a
// country with no badge once the panel was closed.
//
// Local only: provisions a throwaway member via the service role, so it needs
// E2E_BASE_URL pointing at a dev server. Production needs real credentials and
// is covered by navigation.spec.js.
const { test, expect } = require("@playwright/test");
const { createMember } = require("./auth-helper.js");

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const LOCALHOST = BASE.includes("localhost");

test("every filter sits behind one closed-by-default 'Find members by' toggle", async ({ page }) => {
  test.skip(!LOCALHOST, "Set E2E_BASE_URL=...localhost... to run against a dev server");

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
    const setCookies = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie");
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

    await page.goto(`${BASE}/members`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");

    const toggle = page.getByRole("button", { name: /Find members by/ });
    await expect(toggle).toBeVisible();

    // Closed by default: the card is a title plus a single line.
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("p", { hasText: "Find Members" })).toBeVisible();
    for (const label of ["Location", "Hobbies", "Timezone", "Crafts"]) {
      await expect(page.getByText(label, { exact: true })).toBeHidden();
    }
    await expect(page.getByText("Yarn story")).toBeHidden();
    await expect(page.getByText("Your makes")).toBeHidden();
    await expect(page.getByText(/Crochet love quiz/)).toBeHidden();
    await expect(page.getByRole("button", { name: /More filters/ })).toHaveCount(0);

    // Open: core filters and every advanced group arrive together.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (const label of ["Location", "Hobbies", "Timezone", "Crafts"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    for (const group of ["Yarn story", "Your makes"]) {
      await expect(page.getByText(group, { exact: false })).toBeVisible();
    }
    await expect(page.getByText(/Crochet love quiz/)).toBeVisible();

    // A core filter counts toward the badge, so collapsing cannot hide it.
    await page.selectOption('select[aria-label="Filter by location"]', { index: 1 });
    await toggle.click();
    await expect(toggle).toBeVisible();
    await expect(toggle.locator("span").filter({ hasText: /^\d+$/ })).toBeVisible();

    // Reopening keeps the selection.
    await toggle.click();
    await expect(page.getByText("Location", { exact: true })).toBeVisible();
    const selected = await page
      .locator('select[aria-label="Filter by location"]')
      .inputValue();
    expect(selected).not.toBe("");
  } finally {
    await member.cleanup();
  }
});
