import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  COVER_MAX_TALLNESS,
  coverHeightFor,
  coverWindow,
  cropRatioFor,
  exceedsMaxTallness,
} from "../../cover-core.js";

// The reported bug: a sharp strip down the middle of the banner with blurred
// bars either side. That was object-fit: contain inside a container whose ratio
// did not match the image — the blurred backdrop filling the letterbox.
//
// The fix went the other way: covers are stored whole and the slot follows the
// image, so nothing is letterboxed and there is no backdrop at all. These tests
// pin both halves — no crop on upload, and containers that take the image's own
// shape — because the failure mode is symmetric and either mistake brings the
// bars back.

function read(relPath) {
  return readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), "utf8");
}

test("cropRatioFor: avatar stays square, the legacy cover path is 4:1", () => {
  assert.equal(cropRatioFor("avatar"), 1);
  assert.equal(cropRatioFor("cover"), 4);
});

test("coverWindow: an already-4:1 image is used whole", () => {
  assert.deepEqual(coverWindow(1600, 400), { winW: 1600, winH: 400, offX: 0, offY: 0 });
});

test("coverWindow: a portrait photo yields a centered 4:1 band", () => {
  const win = coverWindow(3000, 4000);
  assert.equal(win.winH, 750);
  assert.equal(win.offY, (4000 - 750) / 2);
});

// height/width, so 16:9 is 0.5625 and the cap is 0.6.
test("exceedsMaxTallness: landscape photos render at their natural height", () => {
  assert.equal(exceedsMaxTallness(1600, 400), false); // 4:1 banner
  assert.equal(exceedsMaxTallness(1600, 900), false); // 16:9
  assert.equal(exceedsMaxTallness(1600, 950), false); // just inside the cap
});

test("exceedsMaxTallness: square and portrait photos are capped", () => {
  assert.equal(exceedsMaxTallness(1000, 1000), true); // square
  assert.equal(exceedsMaxTallness(3000, 4000), true); // 4:3 portrait
  assert.equal(exceedsMaxTallness(1080, 1920), true); // 9:16 portrait
  assert.equal(exceedsMaxTallness(1600, 960), false); // exactly at the cap
  assert.equal(exceedsMaxTallness(1600, 961), true); // a hair past it
});

test("exceedsMaxTallness: degenerate input is not treated as too tall", () => {
  assert.equal(exceedsMaxTallness(0, 0), false);
  assert.equal(exceedsMaxTallness(1600, 0), false);
  assert.equal(exceedsMaxTallness(0, 4000), false);
});

test("coverHeightFor: a landscape photo renders at its own height", () => {
  assert.equal(coverHeightFor(1600, 900), 900); // 16:9, under the cap
  assert.equal(coverHeightFor(1600, 400), 400); // 4:1 banner
});

test("coverHeightFor: a portrait photo is clamped, not left to run away", () => {
  const width = 1600;
  assert.equal(coverHeightFor(width, 4000), width * COVER_MAX_TALLNESS);
});

test("coverHeightFor: an unknown image falls back to a sane banner height", () => {
  assert.ok(coverHeightFor(1600, 0) > 0);
  assert.ok(coverHeightFor(1600, 0) <= 1600 * COVER_MAX_TALLNESS);
});

// The regression guard. Before this, both containers pinned a height (160px and
// 180px) and the images used object-fit: contain. Pinning the height is what
// letterboxed a narrow photo; contain is what letterboxes at all.
test("cover containers take the image's height instead of pinning one", () => {
  for (const file of [
    "../../../app/account/cover.module.css",
    "../../../app/members/[id]/profile.module.css",
  ]) {
    const sheet = read(file);
    assert.doesNotMatch(
      sheet,
      /\.coverPreview\s*\{[^}]*height:\s*\d+px/,
      `${file} .coverPreview pins a height`
    );
    assert.doesNotMatch(
      sheet,
      /\.banner\s*\{[^}]*height:\s*\d+px/,
      `${file} .banner pins a height`
    );
  }
});

test("cover images are height:auto so the slot follows the photo", () => {
  const account = read("../../../app/account/cover.module.css");
  const profile = read("../../../app/members/[id]/profile.module.css");
  for (const [name, sheet] of [
    [".coverImg", account],
    [".bannerImg", profile],
  ]) {
    const block = sheet.match(new RegExp(`\\${name}\\s*\\{[^}]*\\}`));
    assert.ok(block, `${name} exists`);
    assert.match(block[0], /height:\s*auto/, `${name} is height: auto`);
    assert.doesNotMatch(block[0], /height:\s*100%/, `${name} is not height: 100%`);
  }
});

// contain is the exact declaration that produced the reported bars.
test("cover images are not object-fit: contain", () => {
  const account = read("../../../app/account/cover.module.css");
  const profile = read("../../../app/members/[id]/profile.module.css");
  assert.doesNotMatch(
    account,
    /\.coverImg\s*\{[^}]*object-fit:\s*contain/,
    ".coverImg still letterboxes"
  );
  assert.doesNotMatch(
    profile,
    /\.bannerImg\s*\{[^}]*object-fit:\s*contain/,
    ".bannerImg still letterboxes"
  );
});

test("both render sites clamp a portrait cover the same way", () => {
  const account = read("../../../app/account/cover.module.css");
  const profile = read("../../../app/members/[id]/profile.module.css");
  const clamp = (sheet) => sheet.match(/max-height:\s*(\d+)px/);
  assert.ok(clamp(account), "editor slot clamps");
  assert.ok(clamp(profile), "profile banner clamps");
  assert.equal(
    clamp(account)[1],
    clamp(profile)[1],
    "editor and profile use the same max-height, so the preview matches the banner"
  );
});

// With no backdrop left, an unclamped portrait photo would simply be huge. This
// asserts the clamp exists in both places rather than trusting a comment.
test("the clamp exists so a portrait photo cannot become a wall", () => {
  for (const file of [
    "../../../app/account/cover.module.css",
    "../../../app/members/[id]/profile.module.css",
  ]) {
    assert.match(read(file), /max-height:\s*\d+px/, `${file} clamps its cover`);
  }
});

// Match the rule, not the word: the comments explain what the backdrop was for,
// so the name legitimately still appears in prose.
test("the blurred backdrop is gone from CSS and from both render sites", () => {
  assert.doesNotMatch(
    read("../../../app/account/cover.module.css"),
    /^\.coverBackdrop\s*\{/m,
    "editor backdrop rule"
  );
  assert.doesNotMatch(
    read("../../../app/members/[id]/profile.module.css"),
    /^\.bannerBackdrop\s*\{/m,
    "profile backdrop rule"
  );

  const editor = read("../../../app/account/ProfileEditor.js");
  assert.doesNotMatch(editor, /coverStyles\.coverBackdrop/, "editor backdrop div");

  const profile = read("../../../app/members/[id]/page.js");
  assert.doesNotMatch(profile, /styles\.bannerBackdrop/, "profile backdrop div");
});

// The blur itself, not the class name. If this ever comes back, the bars return.
test("nothing blurs a copy of the cover behind it", () => {
  for (const file of [
    "../../../app/account/cover.module.css",
    "../../../app/members/[id]/profile.module.css",
  ]) {
    assert.doesNotMatch(read(file), /filter:\s*blur/, `${file} still blurs`);
  }
});

// Storing the photo whole is the other half. cropImageToBanner would crop.
test("the upload path stores the whole photo, not a cropped band", () => {
  const editor = read("../../../app/account/ProfileEditor.js");
  assert.match(
    editor,
    /saveCoverUpload\(encodeFullCover\(/,
    "cover upload still saves the full image"
  );
  assert.doesNotMatch(
    editor,
    /setCropKind\("cover"\)/,
    "cover upload must not open the 4:1 crop"
  );
});

// The CSS clamp is a fixed pixel height, so it can only approximate a
// width-relative rule. Both slots must at least agree with each other, or the
// editor would preview a cover differently from how a visitor sees it. 420px on
// a ~710px card is ~0.59 tallness, within a few percent of the 0.6 the core
// module documents.
test("the CSS clamp matches COVER_MAX_TALLNESS for this card's width", () => {
  const clampPx = Number(
    read("../../../app/members/[id]/profile.module.css").match(/max-height:\s*(\d+)px/)[1]
  );
  const cardContentWidth = 760 - 24 * 2 - 2; // .container padding, .profileCard border
  const implied = clampPx / cardContentWidth;
  assert.ok(
    Math.abs(implied - COVER_MAX_TALLNESS) < 0.05,
    `CSS clamp ${clampPx}px implies ${implied.toFixed(3)} tallness, core says ${COVER_MAX_TALLNESS}`
  );
});