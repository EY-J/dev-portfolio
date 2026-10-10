import type { Project } from "@/types/project";

export type PublicProject = Pick<
  Project,
  | "id"
  | "title"
  | "description"
  | "imageUrl"
  | "technologies"
  | "githubUrl"
  | "liveUrl"
> & { imageAlt?: string };

export interface PublicProjectRow {
  id: string;
  title: string;
  description: string;
  image_url: string;
  technologies: string[];
  github_url: string | null;
  live_url: string | null;
}
