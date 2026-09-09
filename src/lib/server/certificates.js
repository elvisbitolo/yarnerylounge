import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

function generateCertNumber() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "YC-";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function toMillisValue(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return new Date(v).getTime();
}

function mapCertificateRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName || "",
    courseId: row.courseId,
    courseTitle: row.courseTitle || "",
    completedAt: row.completedAt || "",
    certificateNumber: row.certificateNumber || "",
    createdAt: toMillisValue(row.createdAt) || null,
  };
}

export async function generateCertificate({ userId, userName, courseId, courseTitle, completedAt }) {
  const existing = await getCertificateByUserAndCourse(userId, courseId);
  if (existing) return existing;

  const cert = {
    userId,
    userName,
    courseId,
    courseTitle,
    completedAt: completedAt || new Date().toISOString(),
    certificateNumber: generateCertNumber(),
    createdAt: new Date(),
  };
  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.certificate.create({ data: cert });
      return mapCertificateRow(created);
    } catch (err) {
      logError("certificates.prisma_create_failed", { error: err.message });
    }
  }
  return null;
}

export async function getCertificate(certificateId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.certificate.findUnique({ where: { id: certificateId } });
      if (row) return mapCertificateRow(row);
    } catch (err) {
      logError("certificates.prisma_get_failed", { error: err.message });
    }
  }
  return null;
}

export async function getCertificateByUserAndCourse(userId, courseId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.certificate.findFirst({ where: { userId, courseId } });
      if (row) return mapCertificateRow(row);
    } catch (err) {
      logError("certificates.prisma_by_user_course_failed", { error: err.message });
    }
  }
  return null;
}

export async function getUserCertificates(userId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.certificate.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      if (rows.length) return rows.map(mapCertificateRow);
    } catch (err) {
      logError("certificates.prisma_user_failed", { error: err.message });
    }
  }
  return [];
}
