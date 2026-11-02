import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: false }, { status: 501 });
}
