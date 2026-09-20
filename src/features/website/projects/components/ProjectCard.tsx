import Image from "next/image";

import type { PublicProject } from "@/features/website/projects/types";

interface ProjectCardProps {
  project: PublicProject;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  return (
    <article>
      <Image
        alt={project.title}
        height={360}
        src={project.imageUrl}
        unoptimized
        width={640}
      />
      <h2>{project.title}</h2>
      <p>{project.description}</p>
      <ul aria-label="Technologies">
        {project.technologies.map((technology) => (
          <li key={technology}>{technology}</li>
        ))}
      </ul>
      <div>
        {project.githubUrl ? (
          <a href={project.githubUrl} rel="noreferrer" target="_blank">
            GitHub
          </a>
        ) : null}
        {project.liveUrl ? (
          <a href={project.liveUrl} rel="noreferrer" target="_blank">
            Live project
          </a>
        ) : null}
      </div>
    </article>
  );
}
