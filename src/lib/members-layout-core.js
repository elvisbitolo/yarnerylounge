// Pure geometry for the /members constellation editor: what a saved coordinate
// means and whether a stored one is usable.
//
// Deliberately free of `process.env`, Prisma and network imports — this module
// is imported by avatarLayout.js, which in turn is imported by the client
// component that renders the canvas. Anything environment-dependent belongs in
// src/lib/server/members-layout-core.js.

// Key inside User.extra holding the pinned coordinate. "layout" is deliberately
// generic: it is the only arrangement stored there, and each pinned avatar
// carries its own, so the keys never collide across members.
export const LAYOUT_PIN_KEY = "layout";

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

// Validates a pin read back out of User.extra or posted by the client.
// Anything that is not a finite number pair becomes null — a malformed stored
// pin must fall back to the automatic spiral, never to a NaN offset that parks
// the avatar off-canvas.
export function sanitizePin(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp01(x), y: clamp01(y) };
}

// Turns a dropped avatar's virtual-space centre into the normalised 0..1 pin
// that gets stored. Normalised rather than pixel offsets because the canvas
// exists at three widths (960/720/480) and a height that grows with the member
// count — an absolute coordinate would land somewhere else entirely on the next
// viewport or the next filtered view.
export function pinFromVirtual(centerX, centerY, width, height) {
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { x: clamp01(centerX / width), y: clamp01(centerY / height) };
}

// The pin read from a member row, already validated. Returns null when absent
// or unusable so callers never have to remember to sanitise.
export function pinFor(member) {
  return sanitizePin(member?.layoutPin);
}
