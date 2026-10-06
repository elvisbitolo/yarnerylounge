// Placement for the /members constellation. Pure: same member list and canvas
// size always produce the same arrangement.
//
// Relative path with an explicit extension rather than the usual "@/lib/..."
// alias: src/lib/**/__tests__ runs under `node --test`, which has no alias
// resolver, so anything it pulls in must be resolvable from the file system.
// (See how every tested core module avoids "@" imports entirely.)
import { pinFor } from "../../lib/members-layout-core.js";

export const GOLDEN_ANGLE = 2.399963229728653;

export function hashId(id) {
  if (!id) return 0;
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export const LAYOUT_NOW = Date.now();

export function avatarSize(points, createdAt = 0, nowMs = LAYOUT_NOW, min = 48, max = 140) {
  const ageMonths = createdAt > 0 ? Math.max(0, (nowMs - createdAt) / MONTH_MS) : 0;
  const activity = Math.min(64, Math.floor((points || 0) / 12) * 8);
  const tenure = Math.min(28, Math.floor(ageMonths / 2) * 2);
  return Math.min(max, min + activity + tenure);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function relax(slots, width, height, margin, overlapFactor) {
  for (let pass = 0; pass < 3; pass += 1) {
    let moved = false;
    for (let i = 0; i < slots.length; i += 1) {
      for (let j = i + 1; j < slots.length; j += 1) {
        const a = slots[i];
        const b = slots[j];
        // Two deliberately-placed avatars may overlap: the editor put them
        // there, and nudging either one would silently undo the arrangement
        // they just saved.
        if (a.locked && b.locked) continue;
        const ax = a.left + a.size / 2;
        const ay = a.top + a.size / 2;
        const bx = b.left + b.size / 2;
        const by = b.top + b.size / 2;
        const dx = bx - ax;
        const dy = by - ay;
        const dist = Math.hypot(dx, dy) || 1;
        const minDist = ((a.size + b.size) / 2) * overlapFactor;
        if (dist >= minDist) continue;
        const push = ((minDist - dist) / 2) * 1.12;
        const ux = dx / dist;
        const uy = dy / dist;
        // A pinned avatar is immovable, so the free one absorbs the whole
        // correction (hence the x2) instead of the pair splitting it. Without
        // that, relaxation would creep a placed avatar off its saved spot by a
        // few pixels on every render until it had wandered away entirely.
        if (a.locked) {
          b.left += ux * push * 2;
          b.top += uy * push * 2;
        } else if (b.locked) {
          a.left -= ux * push * 2;
          a.top -= uy * push * 2;
        } else {
          a.left -= ux * push;
          a.top -= uy * push;
          b.left += ux * push;
          b.top += uy * push;
        }
        if (!a.locked) {
          a.left = clamp(a.left, margin, width - margin - a.size);
          a.top = clamp(a.top, margin, height - margin - a.size);
        }
        if (!b.locked) {
          b.left = clamp(b.left, margin, width - margin - b.size);
          b.top = clamp(b.top, margin, height - margin - b.size);
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return slots;
}

export function composeLayout(members, opts = {}) {
  const {
    width,
    height,
    minSize = 48,
    maxSize = 140,
    margin = 26,
    jitter = 34,
    nowMs = LAYOUT_NOW,
    overlapFactor = 0.9,
  } = opts;

  if (!members || !members.length) return [];

  const items = members
    .filter((m) => m && m.id)
    .map((m, idx) => ({
    id: m.id,
    points: m.points || 0,
    createdAt: m.createdAt || 0,
    size: avatarSize(m.points, m.createdAt || 0, nowMs, minSize, maxSize),
    // A saved coordinate from the constellation editor. Sanitised here so a
    // malformed stored value degrades to the automatic spiral rather than
    // throwing or parking the avatar somewhere undefined.
    pin: pinFor(m),
    idx,
  }));

  const ranked = [...items].sort((a, b) => b.size - a.size || a.idx - b.idx);
  const n = ranked.length;
  const spread = Math.min(width, height) / 2 - margin;
  const cx = width / 2;
  const cy = height / 2;
  const out = [];

  ranked.forEach((item, i) => {
    let x;
    let y;
    if (item.pin) {
      // Deliberately placed: the pin is the centre as a fraction of the whole
      // virtual canvas, so it survives the three viewport presets and a canvas
      // that grows as members are added or filtered.
      x = item.pin.x * width;
      y = item.pin.y * height;
      x = clamp(x, margin + item.size / 2, width - margin - item.size / 2);
      y = clamp(y, margin + item.size / 2, height - margin - item.size / 2);
    } else {
      const frac = n === 1 ? 0 : i / (n - 1);
      const r = Math.max(0, spread * Math.sqrt(frac) - item.size / 2);
      const theta = i * GOLDEN_ANGLE;
      const h = hashId(item.id);
      const jx = ((h % 251) / 250 - 0.5) * jitter;
      const jy = (((h >> 8) % 251) / 250 - 0.5) * jitter;
      x = cx + Math.cos(theta) * r + jx;
      y = cy + Math.sin(theta) * r + jy;
      x = clamp(x, margin + item.size / 2, width - margin - item.size / 2);
      y = clamp(y, margin + item.size / 2, height - margin - item.size / 2);
    }
    out.push({
      id: item.id,
      left: x - item.size / 2,
      top: y - item.size / 2,
      size: item.size,
      z: 10 + Math.round(item.size / 5),
      locked: Boolean(item.pin),
    });
  });

  return relax(out, width, height, margin, overlapFactor);
}