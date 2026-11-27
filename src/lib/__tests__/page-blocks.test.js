import test from "node:test";
import assert from "node:assert/strict";
import {
  fallbackBlocksFor,
  isPageSlug,
  movePageBlock,
  newPageBlock,
  nextBlockId,
  normalizePageBlock,
  normalizePageBlocks,
  removePageBlock,
  safeBlockHref,
} from "../page-blocks.js";

test("safeBlockHref allows local paths and http(s) only", () => {
  assert.equal(safeBlockHref("/signup"), "/signup");
  assert.equal(safeBlockHref("https://example.com/a"), "https://example.com/a");
  assert.equal(safeBlockHref("javascript:alert(1)"), "");
  assert.equal(safeBlockHref("//evil.example"), "");
  assert.equal(safeBlockHref("/\\evil.example"), "");
  assert.equal(safeBlockHref("mailto:someone@example.com"), "");
  assert.equal(safeBlockHref("/ok\njavascript:alert(1)"), "");
});

test("normalizePageBlock keeps only allow-listed fields per type", () => {
  assert.deepEqual(normalizePageBlock({ id: "a b", type: "heading", text: " Hi ", level: 1, secret: "x" }, 2), {
    id: "ab",
    type: "heading",
    text: "Hi",
    level: 1,
  });
  assert.equal(normalizePageBlock({ type: "paragraph", text: "x", lead: "yes" }).lead, false);
  assert.equal(normalizePageBlock({ type: "unknown", text: "x" }), null);
  assert.equal(normalizePageBlock({ type: "paragraph", text: "  " }), null);
});

test("normalizePageBlocks drops unsafe links and caps the list", () => {
  const blocks = normalizePageBlocks([
    { id: "ok", type: "link", label: "Join", href: "/signup" },
    { id: "bad", type: "link", label: "Bad", href: "javascript:alert(1)" },
    { id: "img", type: "image", src: "https://example.com/a.webp", alt: "A" },
    ...Array.from({ length: 100 }, (_, i) => ({ type: "paragraph", text: `p${i}` })),
  ]);
  assert.equal(blocks.length, 79);
  assert.deepEqual(blocks.slice(0, 2).map((b) => b.id), ["ok", "img"]);
  assert.ok(blocks.every((block) => block.id && block.type));
});

test("newPageBlock produces editable defaults for every block type", () => {
  for (const type of ["heading", "paragraph", "list", "image", "link"]) {
    const block = newPageBlock(type, "custom-id");
    assert.equal(block.type, type);
    assert.equal(block.id, "custom-id");
  }
  assert.equal(newPageBlock("heading", "h").level, 2);
  assert.deepEqual(newPageBlock("list", "l").items, []);
  assert.equal(nextBlockId([{ id: "block-1" }, { id: "block-2" }]), "block-3");
});

test("move and remove helpers do not mutate their input", () => {
  const blocks = [
    { id: "a", type: "paragraph", text: "A" },
    { id: "b", type: "paragraph", text: "B" },
    { id: "c", type: "paragraph", text: "C" },
  ];
  assert.deepEqual(movePageBlock(blocks, 2, 0).map((b) => b.id), ["c", "a", "b"]);
  assert.deepEqual(movePageBlock(blocks, 0, 9).map((b) => b.id), ["a", "b", "c"]);
  assert.deepEqual(removePageBlock(blocks, "b").map((b) => b.id), ["a", "c"]);
  assert.deepEqual(blocks.map((b) => b.id), ["a", "b", "c"]);
});

test("the about fallback is a valid ordered block page", () => {
  assert.equal(isPageSlug("about"), true);
  assert.equal(isPageSlug("__proto__"), false);
  const blocks = fallbackBlocksFor("about");
  assert.ok(blocks.length > 5);
  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[0].level, 1);
  assert.deepEqual(normalizePageBlocks(blocks), blocks);
  assert.equal(blocks.at(-1).href, "/signup");
});
