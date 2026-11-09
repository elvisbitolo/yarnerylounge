import { NextResponse } from "next/server";
import { requireOwner, guardJson } from "@/lib/server/authorize";
import { updateCollection, deleteCollection } from "@/lib/server/collections";
import { httpStatusFor } from "@/lib/server/http-errors";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  const body = await req.json();
  try {
    const updated = await updateCollection(id, {
      name: body.name,
      description: body.description,
      spaceIds: body.spaceIds,
    });
    if (!updated) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    const status = httpStatusFor(err);
    return NextResponse.json(
      { error: status === 500 ? "Could not update collection" : err.message },
      { status }
    );
  }
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  try {
    const deleted = await deleteCollection(id);
    if (!deleted) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = httpStatusFor(err);
    return NextResponse.json(
      { error: status === 500 ? "Could not delete collection" : err.message },
      { status }
    );
  }
}
