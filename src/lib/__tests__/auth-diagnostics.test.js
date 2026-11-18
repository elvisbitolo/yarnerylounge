import { test } from "node:test";
import assert from "node:assert/strict";
import {
  memberFacingAuthMessage,
  recordFetchFailure,
  resetAuthDiagnostics,
} from "../auth-diagnostics.js";

test("network failures name the endpoint without leaking query data", () => {
  resetAuthDiagnostics();
  recordFetchFailure({
    url: "https://abc.supabase.co/auth/v1/signup?email=secret@example.com",
    method: "POST",
    error: { name: "TypeError", message: "Failed to fetch" },
    phase: "supabase_network",
  });
  const message = memberFacingAuthMessage(
    { code: "auth_error", message: "Failed to fetch" },
    { action: "signup" }
  );
  assert.match(message, /registration/);
  assert.match(message, /abc\.supabase\.co\/auth\/v1\/signup/);
  assert.doesNotMatch(message, /email=secret/);
  resetAuthDiagnostics();
});

test("service failures show the HTTP status", () => {
  resetAuthDiagnostics();
  recordFetchFailure({
    url: "https://abc.supabase.co/auth/v1/token",
    status: 503,
    statusText: "Service Unavailable",
    phase: "supabase_http",
  });
  const message = memberFacingAuthMessage(
    { code: "auth_error", message: "Failed to fetch" },
    { action: "login" }
  );
  assert.match(message, /temporarily unavailable \(HTTP 503\)/);
  resetAuthDiagnostics();
});

test("normal provider errors keep their provider message", () => {
  resetAuthDiagnostics();
  const message = memberFacingAuthMessage(
    { code: "invalid_credentials", message: "Invalid login credentials" },
    { action: "login" }
  );
  assert.equal(message, "Invalid login credentials");
});
