import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  COVER_RATIO,
  coverWindow,
  coverHeightFor,
  cropRatioFor,
  defaultCoverCrop,
  initialCoverRect,
} from "../../cover-core.js";

// The reported bug: a sharp strip down the middle of the banner with blurred
// bars either side. That is object-fit: contain inside a container whose ratio
// does not match the image -- the blurred .coverBackdrop / .bannerBackdrop
// showing through the letterbox. These tests pin both halves of the fix: covers
// are cropped to 4:1 on upload, and the render containers are 4:1 too.

function css(relPath) {
  return readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), "utf8");
}

test("COVER_RATIO is 4:1, matching the banner the CSS reserves", () => {
  assert.equal(COVER_RATIO, 4);
});

test("cropRatioFor: avatar stays square, cover is the banner ratio", () => {
  assert.equal(cropRatioFor("avatar"), 1);
  assert.equal(cropRatioFor("cover"), COVER_RATIO);
});

test("coverWindow: an already-4:1 image is used whole", () => {
  const win = coverWindow(1600, 400);
  assert.deepEqual(win, { winW: 1600, winH: 400, offX: 0, offY: 0 });
});

test("coverWindow: a portrait phone photo crops to a centered 4:1 band", () => {
  const win = coverWindow(3000, 4000);
  assert.equal(win.winW, 3000);
  assert.equal(win.winH, 750);
  assert.equal(win.offX, 0);
  assert.equal(win.offY, (4000 - 750) / 2);
});

test("coverWindow: a landscape photo narrower than 4:1 is pillarboxed away", () => {
  const win = coverWindow(800, 600);
  assert.equal(win.winW, 800);
  assert.equal(win.winH, 200);
  assert.equal(win.offX, 0);
  assert.equal(win.offY, 200);
});

test("coverWindow: the window never exceeds the source in either dimension", () => {
  for (const [w, h] of [[1600, 400], [3000, 4000], [800, 600], [1, 1], [5000, 120]]) {
    const win = coverWindow(w, h);
    assert.ok(win.winW <= w, `${w}x${h} width`);
    assert.ok(win.winH <= h, `${w}x${h} height`);
    assert.ok(win.winW > 0 && win.winH > 0, `${w}x${h} non-empty`);
  }
});

test("coverWindow: every result is already 4:1", () => {
  for (const [w, h] of [[1600, 400], [3000, 4000], [800, 600], [4000, 3000], [999, 333]]) {
    const { winW, winH } = coverWindow(w, h);
    assert.ok(Math.abs(winW / winH - COVER_RATIO) < 1e-9, `${w}x${h} -> ${winW}x${winH}`);
  }
});

test("initialCoverRect: is the whole window, so nothing is dropped needlessly", () => {
  const rect = initialCoverRect(3000, 4000);
  const win = coverWindow(3000, 4000);
  assert.deepEqual(rect, { x: win.offX, y: win.offY, w: win.winW, h: win.winH });
});

test("defaultCoverCrop: matches initialCoverRect and stays inside the image", () => {
  for (const [w, h] of [[1600, 400], [3000, 4000], [800, 600]]) {
    const rect = defaultCoverCrop(w, h);
    assert.deepEqual(rect, initialCoverRect(w, h));
    assert.ok(rect.x >= 0 && rect.y >= 0, `${w}x${h} offset`);
    assert.ok(rect.x + rect.w <= w + 1e-9, `${w}x${h} right edge`);
    assert.ok(rect.y + rect.h <= h + 1e-9, `${w}x${h} bottom edge`);
  }
});

test("defaultCoverCrop: its own ratio is 4:1, so the crop cannot letterbox", () => {
  for (const [w, h] of [[1600, 400], [3000, 4000], [800, 600], [4000, 3000]]) {
    const rect = defaultCoverCrop(w, h);
    assert.ok(Math.abs(rect.w / rect.h - COVER_RATIO) < 1e-9, `${w}x${h}`);
  }
});

test("coverHeightFor: a 640px-wide slot is 160px tall at 4:1", () => {
  assert.equal(coverHeightFor(640), 160);
});

// The regression guard. Before the fix these containers were 160px and 180px
// tall against 640px and 760px of width -- roughly 4:1 and 3.94:1 -- while the
// stored image kept whatever ratio it was uploaded with. Assert the shipped CSS
// uses the same ratio the uploader crops to.
test("cover containers declare 4:1 so they agree with the stored ratio", () => {
  for (const file of [
    "../../../app/account/cover.module.css",
    "../../../app/members/[id]/profile.module.css",
  ]) {
    assert.match(css(file), /aspect-ratio:\s*4\s*\/\s*1/, `${file} declares 4:1`);
  }
});

test("cover containers no longer pin a height, which fought the stored ratio", () => {
  for (const file of [
    "../../../app/account/cover.module.css",
    "../../../app/members/[id]/profile.module.css",
  ]) {
    const sheet = css(file);
    assert.doesNotMatch(
      sheet,
      /\.coverPreview\s*\{[^}]*height:\s*160px/,
      `${file} .coverPreview keeps a fixed height`
    );
    assert.doesNotMatch(
      sheet,
      /\.banner\s*\{[^}]*height:\s*180px/,
      `${file} .banner keeps a fixed height`
    );
  }
});

test("cover images use object-fit: cover, so a ratio mismatch crops instead of blurring", () => {
  const account = css("../../../app/account/cover.module.css");
  const profile = css("../../../app/members/[id]/profile.module.css");
  for (const [name, sheet, selector] of [
    [".coverImg", account, /\.coverImg\s*\{[^}]*object-fit:\s*cover/],
    [".bannerImg", profile, /\.bannerImg\s*\{[^}]*object-fit:\s*cover/],
  ]) {
    assert.match(sheet, selector, `${name} is object-fit: cover`);
  }
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

test("the editor encodes covers through the crop, not the full uncropped image", () => {
  const editor = readFileSync(
    fileURLToPath(new URL("../../../app/account/ProfileEditor.js", import.meta.url)),
    "utf8"
  );
  assert.doesNotMatch(editor, /function encodeFullCover/, "encodeFullCover is gone");
  assert.match(editor, /setCropKind\("cover"\)/, "cover upload opens the crop");
  assert.match(editor, /defaultCoverCrop\(/, "cover upload seeds the crop rect");
});