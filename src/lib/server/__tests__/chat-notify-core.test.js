import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chatNotifyType,
  chatRecipientIds,
  chatSnippet,
  shouldEmailChatRecipient,
  shouldNotifyChatRecipient,
} from "../chat-notify-core.js";

// The message route used to fan out only for conversation.type === "dm", so a
// message in a group or region chat notified nobody at all. These tests pin
// the fan-out rules that now cover every conversation type.

test("dm keeps its own notification type", () => {
  assert.equal(chatNotifyType("dm"), "dm");
});

test("group and region chats file under the chat preference", () => {
  assert.equal(chatNotifyType("group"), "chat");
  assert.equal(chatNotifyType("region"), "chat");
});

test("unknown conversation types notify nobody", () => {
  assert.equal(chatNotifyType("space"), "");
  assert.equal(chatNotifyType(undefined), "");
});

test("every participant except the sender is a recipient", () => {
  assert.deepEqual(chatRecipientIds(["a", "b", "c"], "a"), ["b", "c"]);
});

test("a dm still resolves to the single other participant", () => {
  assert.deepEqual(chatRecipientIds(["a", "b"], "a"), ["b"]);
});

test("the sender and blanks are never recipients", () => {
  assert.deepEqual(chatRecipientIds(["", "a", "a", null, "b"], "a"), ["b"]);
});

test("duplicates are collapsed", () => {
  assert.deepEqual(chatRecipientIds(["b", "b", "c", "c"], "a"), ["b", "c"]);
});

test("a malformed participant list yields no recipients", () => {
  assert.deepEqual(chatRecipientIds(null, "a"), []);
  assert.deepEqual(chatRecipientIds(["a"], ""), []);
});

test("an unmuted recipient is notified", () => {
  assert.equal(shouldNotifyChatRecipient({ muted: false, mentioned: false }), true);
});

test("a muted conversation goes quiet", () => {
  assert.equal(shouldNotifyChatRecipient({ muted: true, mentioned: false }), false);
});

test("a direct mention breaks through a mute", () => {
  assert.equal(shouldNotifyChatRecipient({ muted: true, mentioned: true }), true);
});

test("email fires for an unmuted member who has not opted out", () => {
  assert.equal(
    shouldEmailChatRecipient({ globalOff: false, chatPrefOff: false, muted: false }),
    true
  );
});

test("the global opt-out suppresses email even in an active conversation", () => {
  assert.equal(
    shouldEmailChatRecipient({ globalOff: true, chatPrefOff: false, muted: false, mentioned: true }),
    false
  );
});

test("the granular chat preference suppresses email", () => {
  assert.equal(
    shouldEmailChatRecipient({ globalOff: false, chatPrefOff: true, muted: false, mentioned: true }),
    false
  );
});

test("a muted conversation does not email unless mentioned", () => {
  assert.equal(
    shouldEmailChatRecipient({ globalOff: false, chatPrefOff: false, muted: true, mentioned: false }),
    false
  );
  assert.equal(
    shouldEmailChatRecipient({ globalOff: false, chatPrefOff: false, muted: true, mentioned: true }),
    true
  );
});

test("the snippet is the message body when there is one", () => {
  assert.equal(chatSnippet({ text: "  hello there  " }), "hello there");
});

test("an image-only message previews as a photo", () => {
  assert.equal(chatSnippet({ text: "", attachment: { kind: "image" } }), "📷 Photo");
});

test("a file-only message previews with its name", () => {
  assert.equal(
    chatSnippet({ text: "", attachment: { kind: "file", name: "pattern.pdf" } }),
    "📎 pattern.pdf"
  );
  assert.equal(chatSnippet({ text: "", attachment: { kind: "file" } }), "📎 File");
});
