import { getProjectCategory } from "@/features/website/projects/categories";
import type { PublicProject } from "@/features/website/projects/types";

// Public projects arrive newest first. Until the CMS has an editorial featured
// field, lead with two recent web projects and one recent project from another
// category when that mix exists, then fill any gaps from the remaining work.
export function selectFeaturedProjects(projects: PublicProject[]): PublicProject[] {
  const web = projects.filter((project) => getProjectCategory(project) === "web-development");
  const other = projects.filter((project) => getProjectCategory(project) !== "web-development");
  const preferred = [...web.slice(0, 2), ...other.slice(0, 1)];
  const selectedIds = new Set(preferred.map((project) => project.id));
  return [...preferred, ...projects.filter((project) => !selectedIds.has(project.id))].slice(0, 3);
}
