// Hard-deletes a member and every row referencing them (FK-safe).
//
// The straightforward member-owned deleteMany lists only clean rows AUTHORED
// by the deleted user. A member who owns Spaces/Rooms/Groups/Courses also has
// children created by OTHER members (posts in their space, events on their
// room, quiz results on their course, ...) whose foreign keys are NOT
// ON DELETE CASCADE. So those references must be removed before their parents
// can be deleted — otherwise prisma.user.delete() fails with a 500.
import { getPrisma } from "@/lib/db/prisma";

async function collectOwnedParents(prisma, memberId) {
  const spaces = await prisma.space.findMany({
    where: { createdBy: memberId },
    select: { id: true },
  });
  const spaceIds = spaces.map((s) => s.id);

  const rooms = await prisma.room.findMany({
    where: { createdBy: memberId },
    select: { id: true, slug: true },
  });
  const roomIds = rooms.map((r) => r.id);
  const roomSlugs = rooms.map((r) => r.slug).filter(Boolean);

  const groups = await prisma.group.findMany({
    where: { createdBy: memberId },
    select: { id: true },
  });
  const groupIds = groups.map((g) => g.id);

  const ownCourses = await prisma.course.findMany({
    where: { createdBy: memberId },
    select: { id: true },
  });
  const courseIds = ownCourses.map((c) => c.id);

  // Rooms / Courses created by OTHERS inside the member's spaces also die with
  // the space, so their non-cascading children must be cleaned up too.
  const spaceRooms = spaceIds.length
    ? await prisma.room.findMany({
        where: { spaceId: { in: spaceIds } },
        select: { id: true, slug: true },
      })
    : [];
  const spaceRoomIds = spaceRooms.map((r) => r.id);
  const spaceRoomSlugs = spaceRooms.map((r) => r.slug).filter(Boolean);

  const spaceCourses = spaceIds.length
    ? await prisma.course.findMany({
        where: { spaceId: { in: spaceIds } },
        select: { id: true },
      })
    : [];

  return {
    spaceIds,
    roomIds,
    roomSlugs,
    groupIds,
    courseIds,
    spaceRoomIds,
    spaceRoomSlugs,
    spaceCourseIds: spaceCourses.map((c) => c.id),
  };
}

export async function deleteMemberData(prisma, memberId) {
  if (!prisma) prisma = getPrisma();

  const owned = await collectOwnedParents(prisma, memberId);
  const allRoomIds = [...new Set([...owned.roomIds, ...owned.spaceRoomIds])];
  const allRoomSlugs = [...new Set([...owned.roomSlugs, ...owned.spaceRoomSlugs])];
  const allCourseIds = [...new Set([...owned.courseIds, ...owned.spaceCourseIds])];

  await prisma.$transaction([
    // Cross-member children: authored by anyone, referencing parents owned by
    // the member being deleted. Order matters — children before their parents.
    prisma.roomEvent.deleteMany({ where: { roomId: { in: allRoomIds } } }),
    prisma.quizResult.deleteMany({ where: { courseId: { in: allCourseIds } } }),
    prisma.post.deleteMany({
      where: { OR: [{ spaceId: { in: owned.spaceIds } }, { groupId: { in: owned.groupIds } }] },
    }),
    prisma.spacePage.deleteMany({ where: { spaceId: { in: owned.spaceIds } } }),
    prisma.question.deleteMany({ where: { spaceId: { in: owned.spaceIds } } }),
    prisma.conversation.deleteMany({ where: { spaceId: { in: owned.spaceIds } } }),
    prisma.event.deleteMany({
      where: { OR: [{ spaceId: { in: owned.spaceIds } }, { roomSlug: { in: allRoomSlugs } }] },
    }),
    prisma.room.deleteMany({ where: { spaceId: { in: owned.spaceIds } } }),
    prisma.course.deleteMany({ where: { spaceId: { in: owned.spaceIds } } }),

    // Everything the member themselves authored, then the user row.
    prisma.postComment.deleteMany({ where: { authorId: memberId } }),
    prisma.pollVote.deleteMany({ where: { userId: memberId } }),
    prisma.post.deleteMany({ where: { authorId: memberId } }),
    prisma.articleComment.deleteMany({ where: { authorId: memberId } }),
    prisma.article.deleteMany({ where: { authorId: memberId } }),
    prisma.notification.deleteMany({
      where: { OR: [{ userId: memberId }, { actorId: memberId }] },
    }),
    prisma.follow.deleteMany({
      where: { OR: [{ followerId: memberId }, { followingId: memberId }] },
    }),
    prisma.sticker.deleteMany({ where: { OR: [{ fromUid: memberId }, { toUid: memberId }] } }),
    prisma.recognition.deleteMany({
      where: { OR: [{ fromUid: memberId }, { toUid: memberId }] },
    }),
    prisma.hostAssignment.deleteMany({ where: { userId: memberId } }),
    prisma.roomMessage.deleteMany({ where: { userId: memberId } }),
    prisma.roomSignal.deleteMany({ where: { fromIdentity: memberId } }),
    prisma.roomEvent.deleteMany({ where: { userId: memberId } }),
    prisma.roomPresence.deleteMany({ where: { userId: memberId } }),
    prisma.project.deleteMany({ where: { userId: memberId } }),
    prisma.rsvp.deleteMany({ where: { userId: memberId } }),
    prisma.availability.deleteMany({ where: { userId: memberId } }),
    prisma.availabilityRsvp.deleteMany({ where: { userId: memberId } }),
    prisma.conversationMessage.deleteMany({ where: { senderId: memberId } }),
    prisma.typing.deleteMany({ where: { userId: memberId } }),
    prisma.groupMember.deleteMany({ where: { userId: memberId } }),
    prisma.topicReply.deleteMany({ where: { authorId: memberId } }),
    prisma.topicThread.deleteMany({ where: { authorId: memberId } }),
    prisma.spaceMember.deleteMany({ where: { userId: memberId } }),
    prisma.quizResult.deleteMany({ where: { userId: memberId } }),
    prisma.progress.deleteMany({ where: { userId: memberId } }),
    prisma.certificate.deleteMany({ where: { userId: memberId } }),
    prisma.challengeParticipant.deleteMany({ where: { userId: memberId } }),
    prisma.report.deleteMany({
      where: { OR: [{ reporterId: memberId }, { handledBy: memberId }] },
    }),
    prisma.auditLog.deleteMany({ where: { actorId: memberId } }),
    prisma.purchase.deleteMany({ where: { uid: memberId } }),
    prisma.spacePage.deleteMany({ where: { createdBy: memberId } }),
    prisma.question.deleteMany({ where: { createdBy: memberId } }),
    prisma.challenge.deleteMany({ where: { createdBy: memberId } }),
    prisma.course.deleteMany({ where: { createdBy: memberId } }),
    prisma.event.deleteMany({ where: { createdBy: memberId } }),
    prisma.conversation.deleteMany({ where: { createdBy: memberId } }),
    prisma.room.deleteMany({ where: { createdBy: memberId } }),
    prisma.spaceCollection.deleteMany({ where: { createdBy: memberId } }),
    prisma.space.deleteMany({ where: { createdBy: memberId } }),
    prisma.group.deleteMany({ where: { createdBy: memberId } }),
    prisma.subscription.deleteMany({ where: { id: memberId } }),
    prisma.gamification.deleteMany({ where: { id: memberId } }),
    prisma.pushSubscription.deleteMany({ where: { userId: memberId } }),
    prisma.user.delete({ where: { id: memberId } }),
  ]);
}