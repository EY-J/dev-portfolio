import ProjectCard from "@/features/website/projects/components/ProjectCard";
import type { PublicProject } from "@/features/website/projects/types";

interface ProjectListProps {
  projects: PublicProject[];
}

export default function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return <p>No projects are available yet.</p>;
  }

  return (
    <section aria-label="Projects">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </section>
  );
}
