import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { createApiToken, listApiTokens } from "@/lib/server/api-tokens";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const tokens = await listApiTokens(user.uid);
  return NextResponse.json({ tokens });
}

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limited = rateLimitGuard(`api-token-create:${user.uid}`, { limit: 10 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const days = Number(body.expiresInDays);
  const expiresAt = Number.isFinite(days) && days > 0 && days <= 365
    ? new Date(Date.now() + days * 86_400_000)
    : null;

  const result = await createApiToken({
    userId: user.uid,
    name: body.name,
    scopes: body.scopes,
    expiresAt,
  });

  if (result.error === "limit") {
    return NextResponse.json({ error: "Token limit reached" }, { status: 409 });
  }
  if (result.error) {
    return NextResponse.json({ error: "Could not create token" }, { status: 503 });
  }
  return NextResponse.json({ token: result.token, record: result.record }, { status: 201 });
}
