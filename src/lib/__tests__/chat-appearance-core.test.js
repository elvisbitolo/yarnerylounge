import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accentColorFor,
  applyAppearancePatch,
  applyPerChatOverride,
  CHAT_ACCENTS,
  CHAT_WALLPAPERS,
  isWallpaperChoice,
  MAX_CUSTOM_WALLPAPER,
  wallpaperBackgroundFor,
} from "../chat-appearance-core.js";

const tinyImage = "data:image/png;base64,iVBORw0KGgo=";

describe("chat-appearance-core", () => {
  it("exposes a preset list with unique ids", () => {
    const ids = CHAT_WALLPAPERS.map((w) => w.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const w of CHAT_WALLPAPERS) {
      assert.ok(typeof w.label === "string" && w.label.length > 0);
      assert.ok(typeof w.background === "string" && w.background.length > 0);
    }
  });

  it("accepts preset and default wallpaper choices", () => {
    assert.equal(isWallpaperChoice("default"), true);
    assert.equal(isWallpaperChoice("mint"), true);
    assert.equal(isWallpaperChoice("custom"), true);
    assert.equal(isWallpaperChoice("hotpink"), false);
    assert.equal(isWallpaperChoice(""), false);
  });

  it("exposes an accent list of readable, unique colors", () => {
    const ids = CHAT_ACCENTS.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const a of CHAT_ACCENTS) {
      assert.ok(typeof a.label === "string" && a.label.length > 0);
      assert.match(a.color, /^#[0-9a-f]{6}$/i);
    }
  });

  it("settles and clears an accent choice", () => {
    const next = applyAppearancePatch({}, { accent: "ocean" });
    assert.equal(next.accent, "ocean");
    assert.equal(accentColorFor(next), "#2f86eb");
    const reset = applyAppearancePatch(next, { accent: null });
    assert.equal(reset.accent, null);
    assert.equal(accentColorFor(reset), null);
  });

  it("ignores unknown accent ids but keeps the stored one", () => {
    const next = applyAppearancePatch({ accent: "teal" }, { accent: "neon" });
    assert.equal(next.accent, "teal");
    assert.equal(accentColorFor({ accent: "neon" }), null);
  });

  it("keeps accent through wallpaper patches and per-chat overrides", () => {
    const next = applyAppearancePatch({ accent: "berry" }, { wallpaper: "mint" });
    assert.equal(next.accent, "berry");
    const overridden = applyPerChatOverride(next, "a", "dots");
    assert.equal(overridden.accent, "berry");
  });

  it("merges preset choices without clobbering the stored custom image", () => {
    const current = { wallpaper: "mint", customWallpaper: tinyImage };
    const next = applyAppearancePatch(current, { wallpaper: "ocean" });
    assert.equal(next.wallpaper, "ocean");
    assert.equal(next.customWallpaper, tinyImage);
  });

  it("accepts a valid custom image and makes it the wallpaper", () => {
    const next = applyAppearancePatch({}, { wallpaper: "mint", customWallpaper: tinyImage });
    assert.equal(next.wallpaper, "custom");
    assert.equal(next.customWallpaper, tinyImage);
  });

  it("ignores a custom image with the wrong prefix/length", () => {
    const bad = "data:text/html;base64,PHNjcmlwdD4=";
    const next1 = applyAppearancePatch({}, { wallpaper: "custom", customWallpaper: bad });
    assert.equal(next1.wallpaper, "default");
    const tooBig = `data:image/png;base64,${"a".repeat(MAX_CUSTOM_WALLPAPER + 1)}`;
    const next2 = applyAppearancePatch({}, { customWallpaper: tooBig });
    assert.equal(next2.wallpaper, "default");
    assert.equal(next2.customWallpaper, "");
  });

  it("only honors a 'custom' choice when an image is already stored", () => {
    const next = applyAppearancePatch({}, { wallpaper: "custom" });
    assert.equal(next.wallpaper, "default");
    const kept = applyAppearancePatch({ wallpaper: "custom", customWallpaper: tinyImage }, { wallpaper: "mint" });
    assert.equal(kept.customWallpaper, tinyImage);
  });

  it("stores per-conversation overrides and keeps siblings", () => {
    const next = applyPerChatOverride({ wallpaper: "mint", perChat: { a: "ocean" } }, "b", "dots");
    assert.deepEqual(next.perChat, { a: "ocean", b: "dots" });
    const reset = applyPerChatOverride(next, "a", "default");
    assert.equal(reset.perChat.a, "default");
    const rejected = applyPerChatOverride(reset, "c", "duckegg");
    assert.equal(rejected.perChat.c, undefined);
  });

  it("resolves the effective background for a conversation", () => {
    assert.equal(wallpaperBackgroundFor({}, "a"), null);
    assert.equal(wallpaperBackgroundFor({ wallpaper: "mint" }, "a"), CHAT_WALLPAPERS[0].background);
    const overridden = wallpaperBackgroundFor({ wallpaper: "mint", perChat: { a: "ocean" } }, "a");
    assert.equal(overridden, CHAT_WALLPAPERS[1].background);
    const custom = wallpaperBackgroundFor({ wallpaper: "custom", customWallpaper: tinyImage }, "a");
    assert.ok(custom.startsWith('no-repeat center/cover url("data:image'));
    const customHere = wallpaperBackgroundFor(
      { wallpaper: "mint", customWallpaper: tinyImage, perChat: { a: "custom" } },
      "a"
    );
    assert.ok(customHere.startsWith('no-repeat center/cover url("data:image'));
  });
});