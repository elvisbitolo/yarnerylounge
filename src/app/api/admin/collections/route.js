import { NextResponse } from "next/server";
import { requireOwner, guardJson } from "@/lib/server/authorize";
import { listCollections, createCollection } from "@/lib/server/collections";
import { serialize } from "@/lib/server/serialize";
import { httpStatusFor } from "@/lib/server/http-errors";

export async function GET() {
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;
  try {
    const collections = await listCollections();
    return NextResponse.json({ collections: serialize(collections) });
  } catch (err) {
    const status = httpStatusFor(err);
    return NextResponse.json(
      { error: status === 500 ? "Could not load collections" : err.message },
      { status }
    );
  }
}

export async function POST(req) {
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  const body = await req.json();
  try {
    const result = await createCollection({
      name: body.name,
      description: body.description,
      spaceIds: body.spaceIds,
      createdBy: auth.user.uid,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const status = httpStatusFor(err);
    return NextResponse.json(
      { error: status === 500 ? "Could not create collection" : err.message },
      { status }
    );
  }
}
