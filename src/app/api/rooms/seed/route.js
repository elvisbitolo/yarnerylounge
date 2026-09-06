import { NextResponse } from "next/server";
import { requireOwner, guardJson } from "@/lib/server/authorize";
import { seedAlwaysOnRooms } from "@/lib/server/rooms";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  const created = await seedAlwaysOnRooms();
  return NextResponse.json({ rooms: created });
}