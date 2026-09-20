import ProjectList from "@/features/website/projects/components/ProjectList";
import { getPublicProjects } from "@/features/website/projects/service";

export default async function ProjectsPage() {
  const projects = await getPublicProjects();

  return (
    <main>
      <h1>Projects</h1>
      <ProjectList projects={projects} />
    </main>
  );
}
