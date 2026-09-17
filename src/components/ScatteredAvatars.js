"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { roleBadgeLabel } from "@/lib/profile/roles";

const CARD_W = 244;
const CARD_H = 200;

const AVATAR_SIZE = 88;

function initialsOf(name) {
  const parts = (name || "").trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join("").toUpperCase() || "?";
}

function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return (min, max) => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    const t = (h >>> 0) / 4294967296;
    return min + t * (max - min);
  };
}

function roleLabel(member) {
  if (member.role !== "owner" && member.role !== "moderator") return null;
  return roleBadgeLabel(member.role, member.roleLabel);
}

function hueOf(name) {
  let h = 0;
  for (const c of name || "?") h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return (h >>> 0) % 360;
}

function layout(members) {
  const items = members.map((m, i) => {
    const rnd = seededRandom("cluster:" + m.id);
    const norm = rnd(0, 1) ** 1.5;
    const spin = rnd(0, Math.PI * 2);
    const drift = rnd(0, 1) ** 0.7;
    const radius = 6 + (1 - norm) * 118 + drift * 26;
    return {
      m,
      x: Math.cos(spin) * radius,
      y: Math.sin(spin) * radius * 0.7,
      layer: Math.floor(rnd(0, 10)),
    };
  });

  for (let iter = 0; iter < 80; iter += 1) {
    let moved = false;
    for (let a = 0; a < items.length; a += 1) {
      for (let b = a + 1; b < items.length; b += 1) {
        const dx = items[b].x - items[a].x;
        const dy = items[b].y - items[a].y;
        const minD = AVATAR_SIZE * 0.62;
        const d2 = dx * dx + dy * dy;
        if (d2 < minD * minD && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (minD - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          items[a].x -= nx * push;
          items[a].y -= ny * push;
          items[b].x += nx * push;
          items[b].y += ny * push;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    minX = Math.min(minX, it.x);
    maxX = Math.max(maxX, it.x);
    minY = Math.min(minY, it.y);
    maxY = Math.max(maxY, it.y);
  }
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const PAD = 0.1;
  for (const it of items) {
    it.nx = PAD + ((it.x - minX) / spanX) * (1 - 2 * PAD);
    it.ny = PAD + ((it.y - minY) / spanY) * (1 - 2 * PAD);
  }
  return items;
}

export default function ScatteredAvatars({ members = [], meId, limit = 16 }) {
  const [hovered, setHovered] = useState(null);
  const [rect, setRect] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const shown = useMemo(
    () => (expanded ? members : members.slice(0, limit)),
    [members, limit, expanded]
  );
  const items = useMemo(() => layout(shown), [shown]);

  const card = useMemo(() => {
    const member = members.find((m) => m.id === hovered);
    if (!member || !rect) return null;
    const vw = typeof window !== "undefined" ? window.innerWidth : 900;
    const vh = typeof window !== "undefined" ? window.innerHeight : 700;
    const left = Math.max(
      8,
      Math.min(rect.left + rect.width / 2 - CARD_W / 2, vw - CARD_W - 8)
    );
    let top = rect.top - CARD_H - 10;
    if (top < 8) top = Math.min(vh - CARD_H - 8, rect.bottom + 10);
    return { member, left, top };
  }, [hovered, members, rect]);

  function showCard(member, e) {
    setRect(e.currentTarget.getBoundingClientRect());
    setHovered(member.id);
  }

  function hideCard(e) {
    if (e?.relatedTarget?.closest?.("[data-card]")) return;
    setHovered(null);
  }

  function handlePointerDown(member, e) {
    if (e.pointerType !== "touch") return;
    e.preventDefault();
    setRect(e.currentTarget.getBoundingClientRect());
    setHovered(hovered === member.id ? null : member.id);
  }

  const more = members.length - shown.length;

  return (
    <div className="scattered-avatars" onMouseLeave={() => setHovered(null)}>
      <div className="cluster">
        {items.map((item, i) => {
          const m = item.m;
          const active = hovered === m.id;
          const role = roleLabel(m);
          const hue = hueOf(m.name);
          return (
            <Link
              key={m.id}
              href={`/members/${m.id}`}
              className={`avatar-wrap ${active ? "hovered" : ""}`}
              style={{
                left: `calc(${(item.nx * 100).toFixed(2)}% - ${AVATAR_SIZE / 2}px)`,
                top: `calc(${(item.ny * 100).toFixed(2)}% - ${AVATAR_SIZE / 2}px)`,
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
                zIndex: active ? 60 : 20 + item.layer,
              }}
              onMouseEnter={(e) => showCard(m, e)}
              onFocus={(e) => showCard(m, e)}
              onBlur={hideCard}
              onPointerDown={(e) => handlePointerDown(m, e)}
              aria-label={`${m.name}${role ? `, ${role}` : ""}`}
            >
              <span
                className={`avatar ${m.live ? "ring-active" : ""}`}
              >
                {m.photoURL ? (
                  <img
                    src={m.photoURL}
                    alt={m.name}
                    onError={(event) => {
                      const avatar = event.currentTarget.parentElement;
                      if (!avatar) return;
                      let initials = avatar.querySelector(".initials");
                      if (!initials) {
                        initials = document.createElement("span");
                        initials.className = "initials";
                        initials.textContent = initialsOf(m.name);
                        initials.style.background = `linear-gradient(135deg, hsl(${hue}, 45%, 40%), hsl(${(hue + 24) % 360}, 50%, 28%))`;
                        avatar.appendChild(initials);
                      }
                      initials.style.display = "flex";
                      event.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <span
                    className="initials"
                    style={{
                      background: `linear-gradient(135deg, hsl(${hue}, 45%, 40%), hsl(${(hue + 24) % 360}, 50%, 28%))`,
                    }}
                  >
                    {initialsOf(m.name)}
                  </span>
                )}
              </span>
              {role && <span className="owner-badge">{role}</span>}
            </Link>
          );
        })}
        {more > 0 && (
          <button
            type="button"
            className="more-chip"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            {expanded ? "Show less" : `+${more} more`}
          </button>
        )}
      </div>

      {card && (
        <div
          className="card"
          style={{ left: card.left, top: card.top }}
          onMouseEnter={() => setHovered(card.member.id)}
          data-card
        >
          <p className="card-name">
            {card.member.name}
            {roleLabel(card.member) && (
              <span className="card-role">{roleLabel(card.member)}</span>
            )}
          </p>
          {card.member.live && <p className="card-live">● In the lounge now</p>}
          {card.member.headline && (
            <p className="card-headline">{card.member.headline}</p>
          )}
          {card.member.bio && <p className="card-bio">{card.member.bio}</p>}
          <div className="card-actions">
            {meId && card.member.id !== meId && (
              <Link href={`/chat?with=${card.member.id}`} className="action-chat">
                Message
              </Link>
            )}
            <Link
              href={`/members/${card.member.id}`}
              className="action-profile"
            >
              Show profile
            </Link>
          </div>
        </div>
      )}

      <style jsx>{`
        .scattered-avatars {
          width: 100%;
          min-height: 260px;
        }
        .cluster {
          position: relative;
          width: min(100%, 760px);
          min-height: 260px;
          height: clamp(180px, 34vw, 260px);
          margin: 0 auto;
        }
        @media (max-width: 700px) {
          .cluster {
            min-height: 210px;
            height: clamp(180px, 42vw, 220px);
          }
        }
        @media (max-width: 460px) {
          .cluster {
            min-height: 170px;
            height: clamp(160px, 52vw, 190px);
          }
        }
        .avatar-wrap {
          position: absolute;
          display: block;
          border-radius: 50%;
          text-decoration: none;
          cursor: pointer;
          outline: none;
          transition: transform 150ms ease;
        }
        .avatar-wrap.hovered {
          transform: scale(1.1);
        }
        .avatar-wrap:focus-visible .avatar {
          box-shadow: 0 0 0 3px #378add;
        }
        .avatar {
          display: block;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          overflow: hidden;
          border: 2px solid rgba(255, 255, 255, 0.18);
          background: #2a2a2a;
          position: relative;
        }
        .avatar.ring-active {
          border: 3px solid #22c55e;
          box-shadow: 0 0 12px rgba(34, 197, 94, 0.35);
        }
        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .initials {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 700;
          font-size: clamp(1.1rem, 2.2vw, 1.75rem);
          border-radius: 50%;
        }
        .owner-badge {
          position: absolute;
          bottom: -7px;
          left: 50%;
          transform: translateX(-50%);
          background: #fde68a;
          color: #78350f;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 999px;
          white-space: nowrap;
          pointer-events: none;
        }
        .more-chip {
          position: absolute;
          bottom: 4px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(255, 255, 255, 0.08);
          border: 1px dashed rgba(255, 255, 255, 0.28);
          color: #c8c8d2;
          font-size: 13px;
          font-weight: 700;
          padding: 6px 14px;
          border-radius: 999px;
          cursor: pointer;
        }
        .more-chip:hover {
          background: rgba(167, 139, 250, 0.16);
          color: #fff;
        }
        .card {
          position: fixed;
          z-index: 200;
          width: 244px;
          background: #1e1e1e;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 12px;
          padding: 12px 14px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
          animation: cardIn 150ms ease;
        }
        @keyframes cardIn {
          from {
            opacity: 0;
            transform: translateY(4px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .card-name {
          margin: 0 0 4px;
          font-size: 14px;
          font-weight: 700;
          color: #fff;
        }
        .card-role {
          margin-left: 8px;
          font-size: 11px;
          font-weight: 700;
          color: #fbbf24;
        }
        .card-live {
          margin: 0 0 6px;
          font-size: 12px;
          font-weight: 700;
          color: #16a34a;
        }
        .card-headline {
          margin: 0 0 6px;
          font-size: 12px;
          font-weight: 600;
          color: #c4b5fd;
        }
        .card-bio {
          margin: 0 0 8px;
          font-size: 12px;
          line-height: 1.45;
          color: #bbb;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .card-actions {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }
        .card-actions a {
          flex: 1;
          text-align: center;
          padding: 8px 8px;
          border-radius: 9px;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
        }
        .action-chat {
          background: var(--primary);
          color: #fff;
        }
        .action-profile {
          background: rgba(255, 255, 255, 0.09);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .action-profile:hover {
          background: rgba(255, 255, 255, 0.14);
        }

        @media (max-width: 640px) {
          .scattered-avatars {
            min-height: 220px;
          }

          .cluster {
            max-width: 520px;
            height: 220px;
          }

          .card {
            width: 200px;
          }
        }
      `}</style>
    </div>
  );
}