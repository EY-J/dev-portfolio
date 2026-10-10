import type { PublicProject } from "@/features/website/projects/types";

export const projectCategories = [
  { id: "web-development", label: "Web Development" },
  { id: "shopify", label: "Shopify" },
  { id: "automation", label: "Automation" },
] as const;

export type ProjectCategory = (typeof projectCategories)[number]["id"];

// The CMS currently stores technologies, not a project category. Keep this
// temporary classification in one place until an explicit CMS field exists.
export function getProjectCategory(project: PublicProject): ProjectCategory {
  const technologies = project.technologies.map((value) => value.toLowerCase().trim());

  if (technologies.some((value) => value.includes("shopify"))) {
    return "shopify";
  }

  if (technologies.some((value) =>
    /go\s*high\s*level|highlevel|\bghl\b|automation|workflow|zapier|make\.com|n8n/.test(value)
  )) {
    return "automation";
  }

  return "web-development";
}
