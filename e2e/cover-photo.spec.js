// Cover photo spec — a cover must display in full, with no blurred bars down
// either side.
//
// The original report: a sharp strip down the middle of the banner, blurred on
// the left and right. That was not a blur bug. The photo rendered at
// object-fit: contain inside a container of a different ratio, so it
// letterboxed, and a blurred copy of itself sat behind it — the blurred copy
// filling exactly what the photo didn't cover.
//
// The slot now follows the photo (height:auto) and the backdrop is gone, so
// there is nothing to blur and nothing to letterbox. A tall photo is clamped so
// it cannot become a wall, and only then does object-fit crop.
//
// These assertions are about geometry and fit, because that is what the bug
// was. Colour is not checked: it would only prove the fixture round-tripped.
//
// Local only: provisions a throwaway member via the service role, so it needs
// E2E_BASE_URL pointing at a dev server.
const { test, expect } = require("@playwright/test");
const zlib = require("zlib");
const { createMember, setCoverPhoto } = require("./auth-helper.js");

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const LOCALHOST = BASE.includes("localhost");

// The CSS clamp, in px. Must match both render slots; a unit test asserts the
// two agree and that this matches COVER_MAX_TALLNESS.
const CLAMP_PX = 420;

// A solid-colour PNG built by hand, so the fixture is deterministic and needs no
// image library.
function solidPng(width, height) {
  const rowBytes = width * 3;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = 128;
      raw[px + 1] = 128;
      raw[px + 2] = 128;
    }
  }

  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const asDataUrl = (w, h) => `data:image/png;base64,${solidPng(w, h).toString("base64")}`;

// Wide enough to render at its own height without hitting the clamp.
const LANDSCAPE = asDataUrl(800, 200); // 4:1
// Taller than the clamp: must be capped rather than left to run away.
const PORTRAIT = asDataUrl(300, 400); // 3:4

async function signIn(page, member) {
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
}

const bannerLocator = (page) => page.locator('img[class*="bannerImg"]').first();
const editorCoverLocator = (page) => page.locator('img[class*="coverImg"]').first();

// The whole assertion in one place: the rendered box, the decoded image, and
// how they fit together.
async function measure(img) {
  const box = await img.boundingBox();
  expect(box, "cover has a layout box").toBeTruthy();
  expect(box.width).toBeGreaterThan(0);

  const fit = await img.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      objectFit: style.objectFit,
      height: style.height,
      maxHeight: style.maxHeight,
      boxRatio: el.getBoundingClientRect().width / el.getBoundingClientRect().height,
      naturalRatio:
        el.naturalWidth && el.naturalHeight ? el.naturalWidth / el.naturalHeight : null,
      complete: el.complete,
    };
  });
  expect(fit.complete, "cover finished decoding").toBeTruthy();
  expect(fit.naturalRatio, "cover decoded with real dimensions").toBeTruthy();
  return { box, ...fit };
}

test("a wide cover fills the banner at its own ratio", async ({ page }) => {
  test.skip(!LOCALHOST, "Set E2E_BASE_URL=...localhost... to run against a dev server");

  const member = await createMember();
  if (!member) throw new Error("no member");

  try {
    await setCoverPhoto(member.uid, LANDSCAPE);
    await signIn(page, member);
    await page.goto(`${BASE}/members/${member.uid}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");

    const m = await measure(bannerLocator(page));

    // The slot takes the photo's shape: box ratio matches the image ratio.
    // This is the exact condition whose absence caused the bars.
    expect(
      Math.abs(m.boxRatio - m.naturalRatio),
      `banner ${m.boxRatio.toFixed(3)}:1 vs image ${m.naturalRatio.toFixed(3)}:1`
    ).toBeLessThan(0.03);

    // contain is what letterboxes by definition; it must not come back.
    expect(m.objectFit).not.toBe("contain");
    expect(m.height).not.toBe("100%");
  } finally {
    await member.cleanup();
  }
});

test("a portrait cover is capped instead of becoming a wall", async ({ page }) => {
  test.skip(!LOCALHOST, "Set E2E_BASE_URL=...localhost... to run against a dev server");

  const member = await createMember();
  if (!member) throw new Error("no member");

  try {
    await setCoverPhoto(member.uid, PORTRAIT);
    await signIn(page, member);
    await page.goto(`${BASE}/members/${member.uid}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");

    const m = await measure(bannerLocator(page));

    // Clamped to the shared cap, not the photo's own 4:3 height.
    expect(
      Math.abs(m.box.height - CLAMP_PX),
      `clamped banner is ${m.box.height}px tall, expected ${CLAMP_PX}`
    ).toBeLessThan(2);

    // Still spans the full width, so the clamp cropped rather than squashed.
    expect(m.box.width).toBeGreaterThan(300);
  } finally {
    await member.cleanup();
  }
});

test("the banner is never taller than the clamp, at any viewport", async ({ page }) => {
  test.skip(!LOCALHOST, "Set E2E_BASE_URL=...localhost... to run against a dev server");

  const member = await createMember();
  if (!member) throw new Error("no member");

  try {
    // The portrait fixture is the demanding case at every width.
    await setCoverPhoto(member.uid, PORTRAIT);
    await signIn(page, member);
    await page.goto(`${BASE}/members/${member.uid}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");

    for (const width of [1280, 900, 600, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const box = await bannerLocator(page).boundingBox();
      expect(box.width, `banner present at ${width}px`).toBeTruthy();
      expect(
        box.height,
        `banner is ${box.height}px tall at ${width}px, cap is ${CLAMP_PX}`
      ).toBeLessThanOrEqual(CLAMP_PX + 1);
      expect(box.height, "banner is not collapsed").toBeGreaterThan(20);
    }
  } finally {
    await member.cleanup();
  }
});

test("the editor previews the cover exactly as the public banner does", async ({ page }) => {
  test.skip(!LOCALHOST, "Set E2E_BASE_URL=...localhost... to run against a dev server");

  const member = await createMember();
  if (!member) throw new Error("no member");

  try {
    await setCoverPhoto(member.uid, LANDSCAPE);
    await signIn(page, member);

    await page.goto(`${BASE}/account/profile`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    const editor = await measure(editorCoverLocator(page));

    await page.goto(`${BASE}/members/${member.uid}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    const banner = await measure(bannerLocator(page));

    // Same fit, so the editor is not lying about what visitors will see.
    expect(editor.objectFit).toBe(banner.objectFit);
    expect(editor.maxHeight).toBe(banner.maxHeight);
    expect(
      Math.abs(editor.boxRatio - banner.boxRatio),
      `editor ${editor.boxRatio.toFixed(3)}:1 vs banner ${banner.boxRatio.toFixed(3)}:1`
    ).toBeLessThan(0.05);
  } finally {
    await member.cleanup();
  }
});

test("nothing blurs a copy of the cover behind the photo", async ({ page }) => {
  test.skip(!LOCALHOST, "Set E2E_BASE_URL=...localhost... to run against a dev server");

  const member = await createMember();
  if (!member) throw new Error("no member");

  try {
    await setCoverPhoto(member.uid, LANDSCAPE);
    await signIn(page, member);
    await page.goto(`${BASE}/members/${member.uid}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");

    // The bars were the backdrop showing through. With it removed there is
    // nothing left to catch a regression, so assert it is genuinely absent
    // rather than just hidden behind the photo.
    const backdrops = await page.evaluate(() =>
      Array.from(document.querySelectorAll("*"))
        .filter((el) => {
          const s = getComputedStyle(el);
          return (s.filter && s.filter.includes("blur")) || s.backdropFilter?.includes("blur");
        })
        .map((el) => el.className)
    );
    expect(backdrops, "no element blurs behind the cover").toEqual([]);

    const banner = bannerLocator(page);
    await expect(banner).toBeVisible();
    // The image is the topmost thing at its own centre: nothing layered over it.
    const topAtCentre = await banner.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2
      );
      return hit === el || el.contains(hit);
    });
    expect(topAtCentre, "the photo is what you see, not a layer above it").toBeTruthy();
  } finally {
    await member.cleanup();
  }
});