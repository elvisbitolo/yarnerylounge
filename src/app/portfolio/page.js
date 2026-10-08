import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { listProjects } from "@/lib/server/projects";
import ProjectPortfolio from "./ProjectPortfolio";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const projects = await listProjects(user.uid, { includeArchived: true });
  return (
      <ProjectPortfolio initialProjects={projects} />
  );
}
