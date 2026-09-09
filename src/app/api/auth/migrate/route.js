import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/server/same-origin";

// This endpoint is retired. All authentication is now Supabase-only;
// there are no Firebase ID tokens to migrate.
export async function POST(req) {
  const crossOrigin = assertSameOrigin(req);
  if (crossOrigin) return crossOrigin;
  return NextResponse.json(
    { error: "This endpoint has been retired. Use Supabase authentication instead." },
    { status: 410 }
  );
}
