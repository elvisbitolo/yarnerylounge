export const GOLDEN_ANGLE = 2.399963229728653;

export function hashId(id) {
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
        a.left -= ux * push;
        a.top -= uy * push;
        b.left += ux * push;
        b.top += uy * push;
        const halfA = a.size / 2;
        const halfB = b.size / 2;
        a.left = clamp(a.left, margin, width - margin - a.size);
        a.top = clamp(a.top, margin, height - margin - a.size);
        b.left = clamp(b.left, margin, width - margin - b.size);
        b.top = clamp(b.top, margin, height - margin - b.size);
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

  const items = members.map((m, idx) => ({
    id: m.id,
    points: m.points || 0,
    createdAt: m.createdAt || 0,
    size: avatarSize(m.points, m.createdAt || 0, nowMs, minSize, maxSize),
    idx,
  }));

  const ranked = [...items].sort((a, b) => b.size - a.size || a.idx - b.idx);
  const n = ranked.length;
  const spread = Math.min(width, height) / 2 - margin;
  const cx = width / 2;
  const cy = height / 2;
  const out = [];

  ranked.forEach((item, i) => {
    const frac = n === 1 ? 0 : i / (n - 1);
    const r = Math.max(0, spread * Math.sqrt(frac) - item.size / 2);
    const theta = i * GOLDEN_ANGLE;
    const h = hashId(item.id);
    const jx = ((h % 251) / 250 - 0.5) * jitter;
    const jy = (((h >> 8) % 251) / 250 - 0.5) * jitter;
    let x = cx + Math.cos(theta) * r + jx;
    let y = cy + Math.sin(theta) * r + jy;
    x = clamp(x, margin + item.size / 2, width - margin - item.size / 2);
    y = clamp(y, margin + item.size / 2, height - margin - item.size / 2);
    out.push({
      id: item.id,
      left: x - item.size / 2,
      top: y - item.size / 2,
      size: item.size,
      z: 10 + Math.round(item.size / 5),
    });
  });

  return relax(out, width, height, margin, overlapFactor);
}