import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS = new Set(["login", "signup", "oauth_login", "oauth_signup"]);
const ALLOWED_PROVIDERS = new Set(["email", "google", "facebook", "linkedin_oidc", "twitch", "unknown"]);

function cleanText(value, maxLength) {
  return String(value ?? "")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = rateLimitGuard(`auth-attempt:${ip}`, { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = cleanText(body?.action, 24);
  const provider = cleanText(body?.provider, 32);
  const email = cleanText(body?.email, 254).toLowerCase() || null;
  const errorCode = cleanText(body?.errorCode, 100) || null;
  const errorMessage = cleanText(body?.errorMessage, 500) || "Authentication was unsuccessful";

  if (!ALLOWED_ACTIONS.has(action) || !ALLOWED_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "Unsupported authentication event" }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    if (!prisma) throw new Error("Database unavailable");
    await prisma.authAttempt.create({
      data: {
        email,
        action,
        provider,
        errorCode,
        errorMessage,
        source: "client_reported",
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    // Logging must never change the outcome or user-facing error of authentication.
    return NextResponse.json({ error: "Could not record authentication event" }, { status: 503 });
  }
}
