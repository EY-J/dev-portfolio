import ProjectCard from "@/features/website/projects/components/ProjectCard";
import type { PublicProject } from "@/features/website/projects/types";

interface ProjectListProps {
  projects: PublicProject[];
}

export default function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return <p className="mt-6 text-sm text-slate-600">No projects are available yet.</p>;
  }

  return (
    <div aria-label="Projects" className="mt-8 grid gap-6 md:grid-cols-2" role="list">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
