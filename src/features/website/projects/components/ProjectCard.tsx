import Image from "next/image";

import type { PublicProject } from "@/features/website/projects/types";

interface ProjectCardProps {
  project: PublicProject;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" role="listitem">
      <Image
        alt={project.title}
        className="aspect-video w-full bg-slate-100 object-cover"
        height={360}
        src={project.imageUrl}
        unoptimized
        width={640}
      />
      <div className="p-6">
        <h3 className="text-xl font-semibold tracking-tight text-slate-950">{project.title}</h3>
        <p className="mt-3 text-sm leading-7 text-slate-600">{project.description}</p>
        <ul aria-label="Technologies" className="mt-5 flex flex-wrap gap-2">
          {project.technologies.map((technology) => (
            <li className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700" key={technology}>{technology}</li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-5 text-sm font-medium">
          {project.githubUrl ? (
            <a className="text-slate-900 underline underline-offset-4 hover:text-slate-600" href={project.githubUrl} rel="noreferrer" target="_blank">GitHub</a>
          ) : null}
          {project.liveUrl ? (
            <a className="text-slate-900 underline underline-offset-4 hover:text-slate-600" href={project.liveUrl} rel="noreferrer" target="_blank">Live project</a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
