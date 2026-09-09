import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getCourse } from "@/lib/server/courses";
import { getProgress } from "@/lib/server/courses";
import { generateCertificate, getCertificateByUserAndCourse } from "@/lib/server/certificates";
import { getPrisma } from "@/lib/db/prisma";

export async function GET(req, { params }) {
  const { id: courseId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const cert = await getCertificateByUserAndCourse(user.uid, courseId);
  if (!cert) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }
  return NextResponse.json(cert);
}

export async function POST(req, { params }) {
  const { id: courseId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const course = await getCourse(courseId);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const progress = await getProgress(courseId, user.uid);
  const completedLessons = progress.completedLessons || [];

  const prisma = getPrisma();
  const lessonCount = await prisma.lesson.count({ where: { courseId } });
  if (lessonCount > 0 && completedLessons.length < lessonCount) {
    return NextResponse.json({ error: "Course not yet completed" }, { status: 400 });
  }

  const existing = await getCertificateByUserAndCourse(user.uid, courseId);
  if (existing) {
    return NextResponse.json(existing);
  }

  const userDoc = await getUserDoc(user.uid);
  const userName = userDoc?.name || user.name || user.email?.split("@")[0] || "Member";

  const cert = await generateCertificate({
    userId: user.uid,
    userName,
    courseId,
    courseTitle: course.title,
    completedAt: new Date().toISOString(),
  });

  return NextResponse.json(cert);
}
