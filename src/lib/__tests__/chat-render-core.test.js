import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tokenizeChatText } from "../chat-render-core.js";

function text(tokens) {
  return tokens.map((t) => t.value ?? t.label ?? "").join("");
}

describe("chat-render-core", () => {
  it("returns no tokens for empty or non-string input", () => {
    assert.deepEqual(tokenizeChatText(""), []);
    assert.deepEqual(tokenizeChatText(null), []);
    assert.deepEqual(tokenizeChatText(undefined), []);
  });

  it("keeps apostrophes literal instead of producing HTML entities", () => {
    const tokens = tokenizeChatText("it's password is 12345678");
    assert.deepEqual(tokens, [{ type: "text", value: "it's password is 12345678" }]);
    assert.ok(!text(tokens).includes("&#39;"));
    assert.ok(!tokens.some((t) => t.type === "tag"));
  });

  it("does not pre-escape HTML characters", () => {
    const tokens = tokenizeChatText('a & b <c> "d"');
    assert.equal(text(tokens), 'a & b <c> "d"');
  });

  it("does not treat email addresses as mentions", () => {
    const raw = "mail hookingup@gmail.com and flirting@gmail.com";
    const tokens = tokenizeChatText(raw);
    assert.equal(text(tokens), raw);
    assert.ok(!tokens.some((t) => t.type === "mention"));
  });

  it("still links @mentions at the start or after whitespace", () => {
    assert.deepEqual(tokenizeChatText("@christa_lynn hi"), [
      { type: "mention", value: "@christa_lynn", name: "christa_lynn" },
      { type: "text", value: " hi" },
    ]);
    const afterSpace = tokenizeChatText("hi @christa_lynn");
    assert.deepEqual(afterSpace[afterSpace.length - 1], {
      type: "mention",
      value: "@christa_lynn",
      name: "christa_lynn",
    });
  });

  it("parses bold, italic, links and hashtags", () => {
    assert.deepEqual(tokenizeChatText("**bold**"), [{ type: "bold", value: "bold" }]);
    assert.deepEqual(tokenizeChatText("*italic*"), [{ type: "italic", value: "italic" }]);
    assert.deepEqual(tokenizeChatText("[docs](https://example.com/a)"), [
      { type: "link", label: "docs", href: "https://example.com/a" },
    ]);
    assert.deepEqual(tokenizeChatText("#yarn"), [
      { type: "tag", value: "#yarn", name: "yarn" },
    ]);
  });

  it("only accepts http(s) links", () => {
    const raw = "[x](javascript:alert(1))";
    const tokens = tokenizeChatText(raw);
    assert.equal(text(tokens), raw);
    assert.ok(!tokens.some((t) => t.type === "link"));
  });
});
