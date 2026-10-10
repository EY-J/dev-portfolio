import "server-only";

import type { Project } from "@/types/project";
import { createAuthorizedCmsClient } from "@/features/cms/auth/service";
import type { ProjectInput, ProjectRow } from "@/features/cms/projects/types";

const PROJECT_COLUMNS =
  "id, title, description, image_url, technologies, github_url, live_url, created_at, updated_at";

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    technologies: row.technologies,
    githubUrl: row.github_url ?? undefined,
    liveUrl: row.live_url ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function getProjects(): Promise<Project[]> {
  const supabase = await createAuthorizedCmsClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Failed to load projects.");
  }

  return ((data ?? []) as ProjectRow[]).map(mapProject);
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const supabase = await createAuthorizedCmsClient({ requireSitePublication: true });
  const { data, error } = await supabase
    .from("projects")
    .insert({
      title: input.title,
      description: input.description,
      image_url: input.imageUrl,
      technologies: input.technologies,
      github_url: input.githubUrl ?? null,
      live_url: input.liveUrl ?? null,
    })
    .select(PROJECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error("Failed to create project.");
  }

  return mapProject(data as ProjectRow);
}

export async function updateProject(
  id: string,
  input: ProjectInput
): Promise<{ project: Project; previousImageUrl: string }> {
  const supabase = await createAuthorizedCmsClient({ requireSitePublication: true });
  const { data: existingProject, error: existingProjectError } = await supabase
    .from("projects")
    .select("image_url")
    .eq("id", id)
    .single();

  if (existingProjectError || !existingProject) {
    throw new Error("Failed to find project.");
  }

  const { data, error } = await supabase
    .from("projects")
    .update({
      title: input.title,
      description: input.description,
      image_url: input.imageUrl,
      technologies: input.technologies,
      github_url: input.githubUrl ?? null,
      live_url: input.liveUrl ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(PROJECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error("Failed to update project.");
  }

  return {
    project: mapProject(data as ProjectRow),
    previousImageUrl: existingProject.image_url as string,
  };
}

export async function deleteProject(id: string): Promise<Project> {
  const supabase = await createAuthorizedCmsClient({ requireSitePublication: true });
  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .select(PROJECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error("Failed to delete project.");
  }

  return mapProject(data as ProjectRow);
}
