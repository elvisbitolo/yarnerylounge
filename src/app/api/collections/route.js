import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getCollectionsWithSpaces } from "@/lib/server/collections";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const collections = await getCollectionsWithSpaces();
  return NextResponse.json(collections);
}
