"use server";

import { revalidatePath } from "next/cache";

import { getAdminUser } from "@/features/cms/auth/service";
import {
  createProject,
  deleteProject,
  updateProject,
} from "@/features/cms/projects/service";
import type {
  ProjectActionState,
  ProjectInput,
} from "@/features/cms/projects/types";
import { createClient } from "@/lib/supabase/server";
import { deleteProjectImage } from "@/lib/supabase/storage";

const PROJECTS_PATH = "/admin/projects";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseProjectInput(
  formData: FormData
): { input: ProjectInput; error: null } | { input: null; error: string } {
  const title = readText(formData, "title");
  const description = readText(formData, "description");
  const imageUrl = readText(formData, "image_url");
  const githubUrl = readText(formData, "github_url");
  const liveUrl = readText(formData, "live_url");
  const technologies = Array.from(
    new Set(
      readText(formData, "technologies")
        .split(",")
        .map((technology) => technology.trim())
        .filter(Boolean)
    )
  );

  if (!title || !description || !imageUrl || technologies.length === 0) {
    return {
      input: null,
      error: "Title, description, image URL, and technologies are required.",
    };
  }

  if (!isHttpUrl(imageUrl)) {
    return { input: null, error: "Upload a valid project image." };
  }

  if (githubUrl && !isHttpUrl(githubUrl)) {
    return { input: null, error: "Enter a valid GitHub URL." };
  }

  if (liveUrl && !isHttpUrl(liveUrl)) {
    return { input: null, error: "Enter a valid live URL." };
  }

  return {
    input: {
      title,
      description,
      imageUrl,
      technologies,
      githubUrl: githubUrl || undefined,
      liveUrl: liveUrl || undefined,
    },
    error: null,
  };
}

async function isAuthorizedAdmin(): Promise<boolean> {
  return Boolean(await getAdminUser());
}

export async function createProjectAction(
  _previousState: ProjectActionState,
  formData: FormData
): Promise<ProjectActionState> {
  if (!(await isAuthorizedAdmin())) {
    return { success: false, message: "You must be signed in." };
  }

  const result = parseProjectInput(formData);
  if (!result.input) {
    return { success: false, message: result.error };
  }

  try {
    await createProject(result.input);
    revalidatePath(PROJECTS_PATH);
    return { success: true, message: "Project created." };
  } catch {
    return { success: false, message: "Unable to create the project." };
  }
}

export async function updateProjectAction(
  id: string,
  _previousState: ProjectActionState,
  formData: FormData
): Promise<ProjectActionState> {
  if (!(await isAuthorizedAdmin())) {
    return { success: false, message: "You must be signed in." };
  }

  if (!UUID_PATTERN.test(id)) {
    return { success: false, message: "Invalid project identifier." };
  }

  const result = parseProjectInput(formData);
  if (!result.input) {
    return { success: false, message: result.error };
  }

  try {
    const { project, previousImageUrl } = await updateProject(id, result.input);

    if (previousImageUrl !== project.imageUrl) {
      const supabase = await createClient();
      await deleteProjectImage(previousImageUrl, supabase).catch(
        () => undefined
      );
    }

    revalidatePath(PROJECTS_PATH);
    return { success: true, message: "Project updated." };
  } catch {
    return { success: false, message: "Unable to update the project." };
  }
}

export async function deleteProjectAction(
  id: string
): Promise<ProjectActionState> {
  if (!(await isAuthorizedAdmin())) {
    return { success: false, message: "You must be signed in." };
  }

  if (!UUID_PATTERN.test(id)) {
    return { success: false, message: "Invalid project identifier." };
  }

  try {
    const project = await deleteProject(id);
    const supabase = await createClient();
    await deleteProjectImage(project.imageUrl, supabase).catch(() => undefined);
    revalidatePath(PROJECTS_PATH);
    return { success: true, message: "Project deleted." };
  } catch {
    return { success: false, message: "Unable to delete the project." };
  }
}
