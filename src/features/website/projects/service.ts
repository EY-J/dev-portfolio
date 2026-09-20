import "server-only";

import type {
  PublicProject,
  PublicProjectRow,
} from "@/features/website/projects/types";
import { createClient } from "@/lib/supabase/server";

const PUBLIC_PROJECT_COLUMNS =
  "id, title, description, image_url, technologies, github_url, live_url";

function mapPublicProject(row: PublicProjectRow): PublicProject {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    technologies: row.technologies,
    githubUrl: row.github_url ?? undefined,
    liveUrl: row.live_url ?? undefined,
  };
}

export async function getPublicProjects(): Promise<PublicProject[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PUBLIC_PROJECT_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Failed to load projects.");
  }

  return ((data ?? []) as PublicProjectRow[]).map(mapPublicProject);
}
