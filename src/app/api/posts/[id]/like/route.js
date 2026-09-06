import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { canAccessPost, nextLikeState } from "@/lib/server/posts";
import { getCapabilities, canWriteChat } from "@/lib/server/capabilities";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export async function POST(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const userDoc = await getUserDoc(user.uid);
  const caps = await getCapabilities(user.uid);
  if (!canWriteChat(caps) && !(userDoc?.role === "owner" || userDoc?.role === "moderator")) {
    return NextResponse.json({ error: "Live interaction requires an active membership" }, { status: 403 });
  }
  const access = await canAccessPost(id, user.uid, userDoc);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const limited = rateLimitGuard(`like:${user.uid}`, { limit: 60 });
  if (limited) return limited;
  const data = access.post;
  const ref = adminDb().collection("posts").doc(id);

  const { already, liked, count } = nextLikeState(data.likes, user.uid);
  const update = already
    ? {
        [`likes.${user.uid}`]: FieldValue.delete(),
        lastActivityAt: new Date(),
      }
    : {
        [`likes.${user.uid}`]: new Date(),
        lastActivityAt: new Date(),
      };

  await ref.update(update);

  if (!already && data.authorId && data.authorId !== user.uid) {
    const { createNotification } = await import("@/lib/server/notifications");
    const userDoc = await adminDb().collection("users").doc(user.uid).get();
    const actorName = userDoc.exists
      ? userDoc.data().name || user.email?.split("@")[0] || "Member"
      : user.email?.split("@")[0] || "Member";
    await createNotification({
      userId: data.authorId,
      type: "like",
      actorId: user.uid,
      actorName,
      targetId: id,
      href: `/feed`,
      text: `Liked your post`,
    });
  }

  return NextResponse.json({ liked, count });
}
