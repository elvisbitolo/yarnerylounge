import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const UUID = "11111111-1111-4111-8111-111111111111";
const json = (body, init = {}) => ({ body, status: init.status ?? 200 });

const state = {};

const stubs = {
  "next/server": { NextResponse: { json } },
  "next/headers": { cookies: async () => ({ get: () => undefined }) },
  "@supabase/supabase-js": { createClient: () => ({}) },
  "@/lib/server/authorize": {
    requireModerator: async () => {
      state.authChecks.push("moderator");
      return state.auth;
    },
    requireOwner: async () => {
      state.authChecks.push("owner");
      return state.auth;
    },
    guardJson: (result) => (result.ok ? null : json({ error: result.error }, { status: result.status })),
  },
  "@/lib/server/auth": { AUTH_COOKIE: "session" },
  "@/lib/server/auth-core": { parseSessionCookie: () => null },
  "@/lib/server/session-store": { createSession: async () => null },
  "@/lib/server/account-switch": { getSwitchRoot: async () => null, tagSessionForSwitch: async () => {} },
  "@/lib/server/billing": { isActiveSub: () => false },
  "@/lib/db/prisma": { getPrisma: () => state.prisma },
  "@/lib/server/audit": {
    logAudit: async (entry) => {
      state.audits.push(entry);
    },
  },
  "@/lib/server/log": {
    logError: (...args) => state.logs.push(args),
    logInfo: (...args) => state.logs.push(args),
  },
  "@/lib/supabase/service": {
    default: {
      auth: {
        admin: {
          deleteUser: async (uid) => state.deleteAuth(uid),
        },
      },
    },
  },
  "@/lib/server/admin-member-update": {
    normalizeAdminPlan: (value) => ({
      ok: true,
      plan: value === undefined ? undefined : String(value).trim().toLowerCase(),
    }),
    normalizeAdminRole: (value) => ({
      ok: true,
      role: value === undefined ? undefined : String(value).trim().toLowerCase(),
    }),
    normalizeAdminExpiry: (value) => ({ ok: true, expiresAt: value ? new Date(value) : null }),
    resolveAdminMemberStatus: () => ({ category: "active", label: "Active", code: "active" }),
  },
  "@/lib/server/plans": { tierRank: () => 0 },
  "@/lib/server/delete-member-data": {
    deleteMemberData: async (prisma, id) => state.deleteLocal(prisma, id),
  },
};

function stubSource(name) {
  return Object.entries(stubs[name])
    .map(([key, value]) =>
      key === "default"
        ? `export default globalThis.__stubs[${JSON.stringify(name)}].default;`
        : `export const ${key} = globalThis.__stubs[${JSON.stringify(name)}][${JSON.stringify(key)}];`
    )
    .join("\n");
}

globalThis.__stubs = stubs;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(stubs, specifier)) {
      return { url: `stub:${encodeURIComponent(specifier)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("stub:")) {
      return {
        format: "module",
        source: stubSource(decodeURIComponent(url.slice(5))),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { PATCH, DELETE } = await import("../../../app/api/admin/members/[id]/route.js");
const { GET } = await import("../../../app/api/admin/members/route.js");

beforeEach(() => {
  Object.assign(state, {
    auth: { ok: true, user: { uid: "owner-uid" }, userDoc: { role: "owner", name: "Owner" } },
    authChecks: [],
    prisma: null,
    audits: [],
    logs: [],
    events: [],
    queries: {},
    existingUser: {
      id: "member-uid",
      name: "Member",
      email: "member@example.test",
      role: "member",
      plan: "flirting",
      suspended: false,
      foundingMember: false,
    },
    deleteLocal: async () => {
      state.events.push("local");
    },
    deleteAuth: async () => {
      state.events.push("auth");
    },
    users: [],
    subs: [],
    sessions: [],
    failUsers: false,
  });
});

function prismaMock() {
  return {
    user: {
      findUnique: async () => state.existingUser,
      findMany: async (args) => {
        state.queries.users = args;
        if (state.failUsers) throw new Error("db down");
        return state.users;
      },
    },
    subscription: {
      findFirst: async () => null,
      findMany: async (args) => {
        state.queries.subs = args;
        return state.subs;
      },
    },
    session: {
      groupBy: async (args) => {
        state.queries.sessions = args;
        return state.sessions;
      },
    },
    $transaction: async (fn) =>
      fn({
        user: { update: async (args) => { state.queries.userUpdate = args; } },
        subscription: { update: async () => {}, create: async () => {} },
      }),
  };
}

const patch = (body) =>
  PATCH({ json: async () => body }, { params: Promise.resolve({ id: state.existingUser.id }) });

const del = (id) => DELETE({}, { params: Promise.resolve({ id }) });

test("PATCH requires a moderator and blocks suspension edits from moderators", async () => {
  state.auth = { ok: true, user: { uid: "mod-uid" }, userDoc: { role: "moderator", name: "Mod" } };
  state.prisma = prismaMock();
  const res = await patch({ suspended: true });
  assert.equal(res.status, 403);
  assert.match(res.body.error, /owner/);
  assert.deepEqual(state.authChecks, ["moderator"]);
  assert.deepEqual(state.audits, []);
});

test("PATCH logs suspension changes with before/after values only when changed", async () => {
  state.prisma = prismaMock();
  const changed = await patch({ suspended: true });
  assert.equal(changed.status, 200);
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0].action, "member.suspension_changed");
  assert.deepEqual(state.audits[0].metadata, { suspended: true, prevSuspended: false });

  state.audits = [];
  state.existingUser.suspended = true;
  const unchanged = await patch({ suspended: true });
  assert.equal(unchanged.status, 200);
  assert.deepEqual(state.audits, []);
});

test("PATCH logs founding-member changes with before/after values only when changed", async () => {
  state.prisma = prismaMock();
  state.existingUser.foundingMember = true;
  const changed = await patch({ foundingMember: false });
  assert.equal(changed.status, 200);
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0].action, "member.founding_member_changed");
  assert.deepEqual(state.audits[0].metadata, {
    foundingMember: false,
    prevFoundingMember: true,
  });

  state.audits = [];
  state.existingUser.foundingMember = false;
  const unchanged = await patch({ foundingMember: false });
  assert.equal(unchanged.status, 200);
  assert.deepEqual(state.audits, []);
});

test("DELETE requires an owner and rejects a moderator before any deletion", async () => {
  state.auth = { ok: false, status: 403, error: "Forbidden" };
  const res = await del(UUID);
  assert.equal(res.status, 403);
  assert.deepEqual(state.authChecks, ["owner"]);
  assert.deepEqual(state.events, []);
});

test("DELETE keeps the self-delete guard", async () => {
  const res = await del("owner-uid");
  assert.equal(res.status, 400);
  assert.deepEqual(state.events, []);
});

test("DELETE stops before Supabase when local deletion fails", async () => {
  state.prisma = prismaMock();
  state.deleteLocal = async () => {
    state.events.push("local");
    throw new Error("foreign key");
  };
  const res = await del(UUID);
  assert.equal(res.status, 500);
  assert.deepEqual(state.events, ["local"]);
  assert.equal(state.logs.at(-1)[0], "admin.members.delete_prisma_failed");
});

test("DELETE removes local data before the Supabase auth user", async () => {
  state.prisma = prismaMock();
  const res = await del(UUID);
  assert.equal(res.status, 200);
  assert.deepEqual(state.events, ["local", "auth"]);
  assert.equal(state.audits[0].action, "member.deleted");
});

test("DELETE reports a Supabase failure after local data is already gone", async () => {
  state.prisma = prismaMock();
  state.deleteAuth = async () => {
    state.events.push("auth");
    throw new Error("network down");
  };
  const res = await del(UUID);
  assert.equal(res.status, 500);
  assert.match(res.body.error, /sign-in account could not be removed/);
  assert.deepEqual(state.events, ["local", "auth"]);
  assert.equal(state.logs.at(-1)[0], "admin.members.delete_supabase_failed_after_local_delete");
});

test("GET returns 503 when there is no database", async () => {
  const res = await GET();
  assert.equal(res.status, 503);
  assert.deepEqual(state.authChecks, ["moderator"]);
});

test("GET returns 503 on DB failure instead of an empty member list", async () => {
  state.prisma = prismaMock();
  state.failUsers = true;
  const res = await GET();
  assert.equal(res.status, 503);
  assert.equal(res.body.members, undefined);
  assert.equal(state.logs.at(-1)[0], "admin.members.prisma_failed");
});

test("GET has no result caps and excludes revoked sessions from last seen", async () => {
  state.prisma = prismaMock();
  state.users = [
    {
      id: "member-uid",
      name: "Member",
      email: "member@example.test",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      role: "member",
      plan: "flirting",
      suspended: false,
      foundingMember: false,
    },
  ];
  const res = await GET();
  assert.equal(res.status, 200);
  assert.equal(res.body.members.length, 1);
  assert.equal(Object.hasOwn(state.queries.users, "take"), false);
  assert.equal(Object.hasOwn(state.queries.subs, "take"), false);
  assert.deepEqual(state.queries.sessions.by, ["userId"]);
  assert.equal(state.queries.sessions.where.revokedAt, null);
  assert.deepEqual(state.queries.sessions._max, { lastSeenAt: true });
});
