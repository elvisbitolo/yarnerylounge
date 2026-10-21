import { test } from "node:test";
import assert from "node:assert/strict";

const ORIGINAL_URL = process.env.SUPABASE_URL;
const ORIGINAL_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function resetEnv() {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete globalThis.__supabaseAdmin;
}

function restoreEnv() {
  if (ORIGINAL_URL === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = ORIGINAL_URL;
  if (ORIGINAL_KEY === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_KEY;
  delete globalThis.__supabaseAdmin;
}

test("importing the service client does not need credentials", async () => {
  resetEnv();
  const mod = await import("../service.js");
  assert.equal(typeof mod.getSupabaseAdmin, "function");
  assert.equal(typeof mod.default, "object");
  restoreEnv();
});

test("the admin client is built on first use, not at import time", async () => {
  resetEnv();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  const { getSupabaseAdmin } = await import("../service.js");
  const client = getSupabaseAdmin();
  assert.ok(client);
  assert.equal(client, getSupabaseAdmin());
  restoreEnv();
});

test("missing credentials fail when the client is used", async () => {
  resetEnv();
  const { getSupabaseAdmin } = await import("../service.js");
  assert.throws(() => getSupabaseAdmin(), /Supabase service-role credentials missing/);
  restoreEnv();
});

test("a redacted service-role key is rejected", async () => {
  resetEnv();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "[SENSITIVE]";
  const { getSupabaseAdmin } = await import("../service.js");
  assert.throws(() => getSupabaseAdmin(), /looks redacted/);
  restoreEnv();
});

test("the proxy is not treated as a thenable", async () => {
  resetEnv();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  const { default: supabaseAdmin } = await import("../service.js");
  assert.equal(supabaseAdmin.then, undefined);
  assert.equal(await supabaseAdmin, supabaseAdmin);
  restoreEnv();
});
