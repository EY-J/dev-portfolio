import Image from "next/image";

import DeleteProjectButton from "@/features/cms/projects/components/DeleteProjectButton";
import ProjectFormModal from "@/features/cms/projects/components/ProjectFormModal";
import type { Project } from "@/types/project";

interface ProjectTableProps {
  projects: Project[];
}

export default function ProjectTable({ projects }: ProjectTableProps) {
  if (projects.length === 0) {
    return <p className="text-sm text-slate-600">No projects found.</p>;
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <article
          className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"
          key={project.id}
        >
          <div className="relative aspect-video bg-slate-100">
            <Image
              alt={project.title}
              className="object-cover"
              fill
              sizes="(min-width: 1280px) 25vw, (min-width: 640px) 40vw, 90vw"
              src={project.imageUrl}
              unoptimized
            />
          </div>
          <div className="flex flex-1 flex-col p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-950">{project.title}</h3>
              <time className="shrink-0 text-xs text-slate-500">
                {project.createdAt.toLocaleDateString()}
              </time>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {project.description}
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {project.technologies.map((technology) => (
                <span
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                  key={technology}
                >
                  {technology}
                </span>
              ))}
            </div>
            <div className="mt-auto flex items-start gap-2 pt-5">
              <ProjectFormModal project={project} />
              <DeleteProjectButton
                projectId={project.id}
                projectTitle={project.title}
              />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
