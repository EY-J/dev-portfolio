import { ArrowUpRight } from "lucide-react";
import Image from "next/image";

import { getProjectCategory, projectCategories } from "@/features/website/projects/categories";
import type { PublicProject } from "@/features/website/projects/types";

const storagePath = "/storage/v1/object/public/project-images/";

function canOptimizeImage(imageUrl: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;
  try {
    const source = new URL(imageUrl);
    return source.origin === new URL(supabaseUrl).origin && source.pathname.startsWith(storagePath) && !source.search;
  } catch {
    return false;
  }
}

export default function FeaturedProjectList({ projects }: { projects: PublicProject[] }) {
  return (
    <div aria-label="Featured projects" className="featured-project-list" role="list">
      {projects.map((project, index) => {
        const category = projectCategories.find(({ id }) => id === getProjectCategory(project))?.label;
        const primaryUrl = project.liveUrl ?? project.githubUrl;
        const primaryLabel = project.liveUrl ? "View project" : "View code";
        const preview = <Image
          alt={project.imageAlt ?? `Preview of ${project.title}`}
          className="featured-project-image"
          height={1000}
          loading="lazy"
          sizes="(max-width: 700px) 100vw, (max-width: 1000px) 50vw, 33vw"
          src={project.imageUrl}
          unoptimized={!canOptimizeImage(project.imageUrl)}
          width={800}
        />;
        return (
          <article aria-label={`${project.title}, ${category}`} className="featured-project" key={project.id} role="listitem" tabIndex={0}>
            <div className="featured-project-preview">
              {primaryUrl ? <a aria-label={`${primaryLabel}: ${project.title}`} href={primaryUrl} rel="noopener noreferrer" target="_blank">{preview}</a> : preview}
            </div>
            <span aria-hidden="true" className="featured-project-number">{String(index + 1).padStart(2, "0")}</span>
            <div className="featured-project-copy">
              <p className="featured-project-category">{category}</p>
              <h3>{project.title}</h3>
              <p className="featured-project-description">{project.description}</p>
              {project.technologies.length > 0 ? <p className="featured-project-stack">{project.technologies.slice(0, 3).join(" / ")}</p> : null}
              <div className="featured-project-links">
                {primaryUrl ? <a aria-label={`${primaryLabel}: ${project.title}`} href={primaryUrl} rel="noopener noreferrer" target="_blank">{primaryLabel} <ArrowUpRight aria-hidden="true" size={16} /></a> : <span>Preview only</span>}
                {project.liveUrl && project.githubUrl ? <a aria-label={`View code: ${project.title}`} href={project.githubUrl} rel="noopener noreferrer" target="_blank">Code <ArrowUpRight aria-hidden="true" size={15} /></a> : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
