"use server";

import { revalidatePath } from "next/cache";

import { getAdminUser } from "@/features/cms/auth/service";
import { normalizeAssetUrl } from "@/features/portfolio/urls";
import {
  createBlogPost,
  deleteBlogPost,
  updateBlogPost,
} from "@/features/cms/blog/service";
import type {
  BlogActionState,
  BlogPostInput,
} from "@/features/cms/blog/types";

const BLOG_PATH = "/admin/blog";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function parseBlogPostInput(
  formData: FormData
): { input: BlogPostInput; error: null } | { input: null; error: string } {
  const title = readText(formData, "title");
  const slug = readText(formData, "slug");
  const content = readText(formData, "content");
  const imageUrl = readText(formData, "image_url");

  if (!title || !slug || !content) {
    return { input: null, error: "Title, slug, and content are required." };
  }

  if (!SLUG_PATTERN.test(slug)) {
    return {
      input: null,
      error: "Slug must contain lowercase letters, numbers, and hyphens only.",
    };
  }

  if (imageUrl && !normalizeAssetUrl(imageUrl)) {
    return { input: null, error: "Upload a valid cover image." };
  }

  return {
    input: {
      title,
      slug,
      content,
      imageUrl: imageUrl || undefined,
      published: formData.get("published") === "on",
    },
    error: null,
  };
}

export async function createBlogPostAction(
  _previousState: BlogActionState,
  formData: FormData
): Promise<BlogActionState> {
  if (!(await getAdminUser())) {
    return { success: false, message: "You must be signed in." };
  }

  const result = parseBlogPostInput(formData);
  if (!result.input) {
    return { success: false, message: result.error };
  }

  try {
    await createBlogPost(result.input);
    revalidatePath(BLOG_PATH);
    revalidatePath("/authpreview");
    revalidatePath("/admin", "layout");
    return { success: true, message: "Blog post saved to draft." };
  } catch {
    return { success: false, message: "Unable to create the blog post." };
  }
}

export async function updateBlogPostAction(
  id: string,
  _previousState: BlogActionState,
  formData: FormData
): Promise<BlogActionState> {
  if (!(await getAdminUser())) {
    return { success: false, message: "You must be signed in." };
  }

  if (!UUID_PATTERN.test(id)) {
    return { success: false, message: "Invalid blog post identifier." };
  }

  const result = parseBlogPostInput(formData);
  if (!result.input) {
    return { success: false, message: result.error };
  }

  try {
    await updateBlogPost(id, result.input);
    revalidatePath(BLOG_PATH);
    revalidatePath("/authpreview");
    revalidatePath("/admin", "layout");
    return { success: true, message: "Blog post saved to draft." };
  } catch {
    return { success: false, message: "Unable to update the blog post." };
  }
}

export async function deleteBlogPostAction(
  id: string
): Promise<BlogActionState> {
  if (!(await getAdminUser())) {
    return { success: false, message: "You must be signed in." };
  }

  if (!UUID_PATTERN.test(id)) {
    return { success: false, message: "Invalid blog post identifier." };
  }

  try {
    await deleteBlogPost(id);
    revalidatePath(BLOG_PATH);
    revalidatePath("/authpreview");
    revalidatePath("/admin", "layout");
    return { success: true, message: "Blog post deleted from draft." };
  } catch {
    return { success: false, message: "Unable to delete the blog post." };
  }
}
