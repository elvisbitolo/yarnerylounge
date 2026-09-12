import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function deleteDocs() {
  // Legacy batch-delete helper — no longer needed after the Prisma migration.
}

export async function deleteWhere(collectionPath, field, value) {
  const prisma = getPrisma();
  if (!prisma) return;
  const modelMap = {
    events: "event",
    lessons: "lesson",
    modules: "module",
    posts: "post",
    spaceMembers: "spaceMember",
    rooms: "room",
    quizzes: "quiz",
    quizResults: "quizResult",
    progress: "progress",
    certificates: "certificate",
    availability: "availability",
    availabilityRsvps: "availabilityRsvp",
  };
  const model = modelMap[collectionPath];
  if (!model) return;
  try {
    await prisma[model].deleteMany({ where: { [field]: value } });
  } catch (err) {
    logError("delete.prisma_deleteWhere_failed", { error: err.message, collectionPath });
  }
}

export async function deleteSubcollection() {
  // Legacy subcollection delete — no longer needed after the Prisma migration.
}

export async function deletePostWithComments(postRef) {
  const prisma = getPrisma();
  const postId = typeof postRef === "string" ? postRef : postRef?.id;
  if (prisma && postId) {
    try {
      await prisma.post.delete({ where: { id: postId } });
      return;
    } catch (err) {
      if (err?.code !== "P2025") {
        logError("delete.prisma_post_failed", { error: err.message, postId });
      }
    }
  }
}
