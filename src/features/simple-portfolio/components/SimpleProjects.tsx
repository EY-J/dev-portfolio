import { getProjectCategory, projectCategories } from "@/features/website/projects/categories";
import SimpleProjectPreview from "@/features/simple-portfolio/components/SimpleProjectPreview";
import type { PublicProject } from "@/features/website/projects/types";
import { normalizeAssetUrl, normalizeHttpUrl } from "@/features/portfolio/urls";

export default function SimpleProjects({ number, projects }: { number: string; projects: PublicProject[] }) {
  return (
    <section aria-labelledby="simple-projects-heading" className="simple-section simple-projects" id="projects">
      <div className="simple-projects-heading simple-split">
        <p className="simple-section-label">{number} / Projects</p>
        <div className="simple-section-content">
          <h2 id="simple-projects-heading">Selected projects<span aria-hidden="true">.</span></h2>
          <p className="simple-section-intro">A closer look at work built with the tools above.</p>
        </div>
      </div>

      {projects.length > 0 ? (
        <div className="simple-project-list">
          {projects.map((project, index) => {
            const imageUrl = normalizeAssetUrl(project.imageUrl);
            const previewUrl = imageUrl && (imageUrl.startsWith("/") || new URL(imageUrl).hostname !== "placehold.co") ? imageUrl : null;
            const liveUrl = normalizeHttpUrl(project.liveUrl);
            const codeUrl = normalizeHttpUrl(project.githubUrl);
            const category = projectCategories.find(({ id }) => id === getProjectCategory(project))?.label ?? "Web Development";

            return (
              <article className="simple-project-row" key={project.id}>
                <div className="simple-project-preview">
                  <SimpleProjectPreview imageUrl={previewUrl} index={index} title={project.title} alt={project.imageAlt} />
                </div>
                <div className="simple-project-info">
                  <p className="simple-project-meta">{String(index + 1).padStart(2, "0")} <span aria-hidden="true">/</span> {category}</p>
                  <h3>{project.title}</h3>
                  {project.description ? <p className="simple-project-description">{project.description}</p> : null}
                  {project.technologies.length > 0 ? (
                    <ul aria-label={`${project.title} technologies`} className="simple-project-tech">
                      {project.technologies.slice(0, 5).map((technology) => <li key={technology}>{technology}</li>)}
                    </ul>
                  ) : null}
                  {liveUrl || codeUrl ? (
                    <div className="simple-project-links">
                      {liveUrl ? <a href={liveUrl} rel="noopener noreferrer" target="_blank">View project <span aria-hidden="true">&#8599;</span><span className="sr-only"> (opens in a new tab)</span></a> : null}
                      {codeUrl ? <a href={codeUrl} rel="noopener noreferrer" target="_blank">Source code <span aria-hidden="true">&#8599;</span><span className="sr-only"> (opens in a new tab)</span></a> : null}
                    </div>
                  ) : <p className="simple-project-unavailable">Public preview coming soon.</p>}
                </div>
              </article>
            );
          })}
        </div>
      ) : <p className="simple-project-empty">Selected projects are being prepared. Check back soon.</p>}
    </section>
  );
}
