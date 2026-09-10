import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { listProjects } from "@/lib/server/projects";
import Nav from "@/components/Nav";
import ProjectPortfolio from "./ProjectPortfolio";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const userDoc = await getUserDoc(user.uid);
  const projects = await listProjects(user.uid, { includeArchived: true });
  return (
    <Nav role={userDoc?.role}>
      <ProjectPortfolio initialProjects={projects} />
    </Nav>
  );
}
