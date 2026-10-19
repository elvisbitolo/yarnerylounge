import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAT_SETTINGS_DEFAULTS,
  applyMuteSelection,
  applyPrefsToConversations,
  containsMention,
  isConversationMuted,
  mergeChatSettings,
  mergeConversationPrefs,
  muteSelectionFromPrefs,
  normalizeChatSettings,
  normalizeConversationPrefPatch,
  readChatPrefs,
  resolveChatPrefs,
} from "../chat-settings-core.js";

describe("chat-settings-core", () => {
  it("keeps every default when given no patch", () => {
    assert.deepEqual(mergeChatSettings({}, {}), CHAT_SETTINGS_DEFAULTS);
    assert.deepEqual(mergeChatSettings(null, undefined), CHAT_SETTINGS_DEFAULTS);
  });

  it("merges a valid patch over the defaults", () => {
    const merged = mergeChatSettings({}, { messageSound: false });
    assert.equal(merged.messageSound, false);
    assert.equal(merged.readReceipts, true);
  });

  it("drops unknown keys, wrong types and bad enums from a patch", () => {
    assert.deepEqual(
      normalizeChatSettings({ readReceipts: "yes", onlineVisibility: "friends", pinned: true }),
      {}
    );
    assert.deepEqual(
      normalizeChatSettings({ onlineVisibility: "nobody", typingHidden: true }),
      { onlineVisibility: "nobody", typingHidden: true }
    );
  });

  it("reads prefs only for the given conversation", () => {
    const extra = { chatPrefs: { a: { muted: true }, b: { pinned: true } } };
    assert.deepEqual(readChatPrefs(extra, "a"), { muted: true });
    assert.deepEqual(readChatPrefs(extra, "c"), {});
    assert.deepEqual(readChatPrefs(null, "a"), {});
  });

  it("treats always-mute and timed mute correctly", () => {
    const now = 1_000_000;
    assert.equal(isConversationMuted({ muted: true }, now), true);
    assert.equal(isConversationMuted({ mutedUntil: now + 1000 }, now), true);
    assert.equal(isConversationMuted({ mutedUntil: now - 1000 }, now), false);
    assert.equal(isConversationMuted({}, now), false);
  });

  it("applies mute durations to prefs", () => {
    const now = Date.now();
    const timed = applyMuteSelection({}, "8h", now);
    assert.equal(timed.muted, undefined);
    assert.equal(timed.mutedUntil, now + 8 * 60 * 60 * 1000);
    const always = applyMuteSelection({}, "always");
    assert.equal(always.muted, true);
    const off = applyMuteSelection({ muted: true, pinnedAt: 5 }, "off");
    assert.equal(off.muted, undefined);
    assert.equal(off.pinnedAt, 5);
  });

  it("maps stored prefs back to a mute selection", () => {
    assert.equal(muteSelectionFromPrefs({}, Date.now()), "off");
    assert.equal(muteSelectionFromPrefs({ muted: true }, Date.now()), "always");
    const now = Date.now();
    assert.equal(
      muteSelectionFromPrefs({ mutedUntil: now + 2 * 60 * 60 * 1000 }, now),
      "1h"
    );
    assert.equal(
      muteSelectionFromPrefs({ mutedUntil: now + 8 * 60 * 60 * 1000 }, now),
      "8h"
    );
  });

  it("normalizes and merges per-conversation pref patches", () => {
    assert.deepEqual(normalizeConversationPrefPatch({ muted: "nope" }), {});
    assert.deepEqual(normalizeConversationPrefPatch({ muted: "off" }), {
      muted: false,
      mutedUntil: 0,
    });
    const now = Date.now();
    const pinPatch = normalizeConversationPrefPatch({ pinned: true, archived: true }, now);
    assert.equal(pinPatch.pinnedAt, now);
    assert.equal(pinPatch.archivedAt, now);
    const unpinPatch = normalizeConversationPrefPatch({ pinned: false }, now);
    assert.equal(unpinPatch.pinnedAt, 0);
    const timedPatch = normalizeConversationPrefPatch({ muted: "1h", pinned: true }, now);
    assert.equal(timedPatch.mutedUntil, now + 60 * 60 * 1000);
    assert.equal(timedPatch.muted, undefined);
    assert.equal(timedPatch.pinnedAt, now);
  });

  it("merges a conversation pref patch without clobbering siblings", () => {
    const extra = { chatPrefs: { a: { muted: true } } };
    const next = mergeConversationPrefs(extra, "a", { pinnedAt: 42 });
    assert.deepEqual(next.a, { muted: true, pinnedAt: 42 });
    const other = mergeConversationPrefs(extra, "b", { pinnedAt: 7 });
    assert.deepEqual(other.a, { muted: true });
    assert.deepEqual(other.b, { pinnedAt: 7 });
  });

  it("resolves prefs into display flags", () => {
    assert.deepEqual(resolveChatPrefs(null, 1000), {
      pinned: false,
      archived: false,
      muted: false,
      mutedUntil: 0,
      pinnedAt: 0,
      archivedAt: 0,
    });
    const resolved = resolveChatPrefs({ pinnedAt: 5, mutedUntil: 5000 }, 1000);
    assert.equal(resolved.pinned, true);
    assert.equal(resolved.muted, true);
  });

  it("overlays prefs onto conversation rows", () => {
    const rows = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
    const withPrefs = applyPrefsToConversations(rows, { a: { pinnedAt: 5 } });
    assert.equal(withPrefs[0].pinned, true);
    assert.equal(withPrefs[1].pinned, undefined);
    assert.equal(withPrefs[1].title, "B");
  });

  it("detects mention of a username (case-insensitive)", () => {
    assert.equal(containsMention("hey @YarnKing!", "yarnking"), true);
    assert.equal(containsMention("hey @yarnking!", "YarnKing"), true);
    assert.equal(containsMention("ping @someone", "yarnking"), false);
    assert.equal(containsMention("", "yarnking"), false);
    assert.equal(containsMention("plain text", ""), false);
  });
});