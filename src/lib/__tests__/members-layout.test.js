import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAYOUT_PIN_KEY,
  sanitizePin,
  pinFromVirtual,
  pinFor,
} from "../members-layout-core.js";
import { composeLayout } from "../../app/members/avatarLayout.js";

// The editor allow-list is read from the environment at module load, so drop
// it first to pin these assertions to the shipped default. Dynamic import
// because static imports are hoisted above this statement.
delete process.env.MEMBERS_LAYOUT_EDITORS;
const { isLayoutEditor } = await import("../server/members-layout-core.js");

const CANVAS = { width: 960, height: 560 };

function slot(slots, id) {
  const found = slots.find((s) => s.id === id);
  assert.ok(found, `expected a slot for ${id}`);
  return found;
}

function members(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `member-${i}`,
    points: 200 + i * 40,
    createdAt: 1_700_000_000_000 + i * 86_400_000,
  }));
}

// --- permission -------------------------------------------------------------

test("the two curated accounts may edit the layout", () => {
  assert.equal(isLayoutEditor({ email: "secretyarnery@gmail.com" }), true);
  assert.equal(isLayoutEditor({ email: "elvisbitolo11@gmail.com" }), true);
});

test("matching is case and whitespace insensitive", () => {
  assert.equal(isLayoutEditor({ email: "  Secretyarnery@Gmail.com " }), true);
});

// An exact match, not a substring or a suffix — otherwise any account that
// merely ends in one of these addresses could rearrange a public page.
test("lookalike addresses are not editors", () => {
  for (const email of [
    "xsecretyarnery@gmail.com",
    "secretyarnery+x@gmail.com",
    "secretyarnery@gmail.com.evil.test",
    "secretyarnery@evil.com",
    "notelvisbitolo11@gmail.com",
  ]) {
    assert.equal(isLayoutEditor({ email }), false, email);
  }
});

test("role and a missing email do not grant edit rights", () => {
  assert.equal(isLayoutEditor({ role: "owner" }), false);
  assert.equal(isLayoutEditor({ email: "" }), false);
  assert.equal(isLayoutEditor({ email: null }), false);
  assert.equal(isLayoutEditor(null), false);
  assert.equal(isLayoutEditor(undefined), false);
});

test("the pin key is what lands in User.extra", () => {
  assert.equal(LAYOUT_PIN_KEY, "layout");
});

// --- pin validation ---------------------------------------------------------

test("unusable pins are rejected", () => {
  assert.equal(sanitizePin(null), null);
  assert.equal(sanitizePin(undefined), null);
  assert.equal(sanitizePin("0.5"), null);
  assert.equal(sanitizePin({}), null);
  assert.equal(sanitizePin({ x: 0.5 }), null);
  assert.equal(sanitizePin({ x: "left", y: 0.5 }), null);
  assert.equal(sanitizePin({ x: NaN, y: 0.5 }), null);
  assert.equal(sanitizePin({ x: Infinity, y: 0.5 }), null);
});

test("usable pins are clamped into the unit square", () => {
  assert.deepEqual(sanitizePin({ x: -3, y: 9 }), { x: 0, y: 1 });
  assert.deepEqual(sanitizePin({ x: "0.25", y: "0.75" }), { x: 0.25, y: 0.75 });
});

test("pinFor reads and validates the member's own layoutPin", () => {
  assert.deepEqual(pinFor({ layoutPin: { x: 0.1, y: 0.2 } }), { x: 0.1, y: 0.2 });
  assert.equal(pinFor({ layoutPin: { x: "nope", y: 1 } }), null);
  assert.equal(pinFor({}), null);
  assert.equal(pinFor(null), null);
  assert.equal(pinFor({ layoutPin: null }), null);
});

test("a drop round-trips back to the same spot on the canvas", () => {
  const width = 960;
  const height = 700;
  const pin = pinFromVirtual(300, 400, width, height);
  assert.ok(pin);
  const s = slot(composeLayout([{ id: "a", layoutPin: pin }], { width, height }), "a");
  assert.ok(Math.abs(s.left + s.size / 2 - 300) < 1e-6, `left ${s.left}`);
  assert.ok(Math.abs(s.top + s.size / 2 - 400) < 1e-6, `top ${s.top}`);
});

test("a drop without a usable canvas is rejected", () => {
  assert.equal(pinFromVirtual(10, 10, 0, 560), null);
  assert.equal(pinFromVirtual(NaN, 10, 960, 560), null);
  assert.equal(pinFromVirtual(10, Infinity, 960, 560), null);
});

// --- placement --------------------------------------------------------------

test("a pinned avatar is placed at its saved coordinate", () => {
  const s = slot(composeLayout([{ id: "a", layoutPin: { x: 0.5, y: 0.5 } }], CANVAS), "a");
  assert.equal(s.locked, true);
  assert.ok(Math.abs(s.left + s.size / 2 - 480) < 1e-6);
  assert.ok(Math.abs(s.top + s.size / 2 - 280) < 1e-6);
});

// The regression this whole feature is most likely to hit: relaxation nudges
// every pair it touches, and a pinned avatar would creep away from its saved
// spot a few pixels per render until it was somewhere else entirely. The pin
// must hold alone and in a crowd.
test("relaxation never moves a pinned avatar", () => {
  const pin = { x: 0.2, y: 0.35 };
  const alone = slot(composeLayout([{ id: "p", layoutPin: pin }], CANVAS), "p");
  const crowded = slot(
    composeLayout([{ id: "p", layoutPin: pin }, ...members(14)], CANVAS),
    "p"
  );
  assert.equal(crowded.left, alone.left);
  assert.equal(crowded.top, alone.top);
  assert.equal(crowded.size, alone.size);
});

test("two avatars pinned to the same spot are both honoured", () => {
  const slots = composeLayout(
    [
      { id: "a", layoutPin: { x: 0.5, y: 0.5 } },
      { id: "b", layoutPin: { x: 0.5, y: 0.5 } },
    ],
    CANVAS
  );
  for (const id of ["a", "b"]) {
    const s = slot(slots, id);
    assert.ok(Math.abs(s.left + s.size / 2 - 480) < 1e-6, id);
    assert.ok(Math.abs(s.top + s.size / 2 - 280) < 1e-6, id);
    assert.equal(s.locked, true);
  }
});

test("free avatars give way to a pin instead of covering it", () => {
  const slots = composeLayout(
    [{ id: "p", layoutPin: { x: 0.5, y: 0.5 } }, ...members(3)],
    CANVAS
  );
  const p = slot(slots, "p");
  for (const m of members(3)) {
    const free = slot(slots, m.id);
    const dist = Math.hypot(
      free.left + free.size / 2 - (p.left + p.size / 2),
      free.top + free.size / 2 - (p.top + p.size / 2)
    );
    const minDist = ((p.size + free.size) / 2) * 0.9;
    assert.ok(dist >= minDist - 1e-6, `${m.id} dist=${dist} min=${minDist}`);
  }
});

test("an unusable stored pin falls back to the spiral, not to NaN", () => {
  const slots = composeLayout(
    [
      { id: "bad", layoutPin: { x: "left", y: null } },
      { id: "none" },
      { id: "half", layoutPin: { x: 0.4 } },
    ],
    CANVAS
  );
  for (const s of slots) {
    assert.equal(s.locked, false, s.id);
    assert.ok(Number.isFinite(s.left) && Number.isFinite(s.top), s.id);
  }
});

test("a pin outside the canvas is clamped back inside it", () => {
  const s = slot(
    composeLayout([{ id: "a", layoutPin: { x: 1.4, y: -2 } }], CANVAS),
    "a"
  );
  assert.ok(s.left >= 26, `left ${s.left}`);
  assert.ok(s.top >= 26, `top ${s.top}`);
  assert.ok(s.left + s.size <= 960 - 26, `right ${s.left + s.size}`);
  assert.ok(s.top + s.size <= 560 - 26, `bottom ${s.top + s.size}`);
});

test("every slot lands inside the canvas with a usable z-index", () => {
  const slots = composeLayout(
    [...members(20), { id: "pinned", layoutPin: { x: 0.02, y: 0.98 } }],
    CANVAS
  );
  assert.equal(slots.length, 21);
  for (const s of slots) {
    assert.ok(Number.isFinite(s.left) && Number.isFinite(s.top), s.id);
    assert.ok(s.left >= 0 && s.left + s.size <= CANVAS.width, s.id);
    assert.ok(s.top >= 0 && s.top + s.size <= CANVAS.height, s.id);
    assert.ok(Number.isFinite(s.z), s.id);
  }
});

test("the same members and canvas always produce the same arrangement", () => {
  const list = [...members(9), { id: "pinned", layoutPin: { x: 0.7, y: 0.3 } }];
  const first = composeLayout(list, CANVAS);
  const second = composeLayout([...list], CANVAS);
  assert.deepEqual(first, second);
});
