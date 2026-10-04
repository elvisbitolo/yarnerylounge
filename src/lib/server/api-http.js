import { NextResponse } from "next/server";

// The public /api/v1 surface authenticates with a Bearer token (never cookies),
// so it can safely be called from any origin. These headers let a member's own
// website call it from the browser.
export const API_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function apiPreflight() {
  return new NextResponse(null, { status: 204, headers: API_CORS });
}

export function apiJson(body, init = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...API_CORS, ...(init.headers || {}) },
  });
}
