import "server-only";

import type { BlogPostInput, BlogPostRow } from "@/features/cms/blog/types";
import { createClient } from "@/lib/supabase/server";
import type { BlogPost } from "@/types/blog";

const BLOG_POST_COLUMNS =
  "id, title, slug, content, image_url, published, created_at, updated_at";

function mapBlogPost(row: BlogPostRow): BlogPost {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    content: row.content,
    imageUrl: row.image_url ?? undefined,
    published: row.published,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function getBlogPosts(): Promise<BlogPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(BLOG_POST_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Failed to load blog posts.");
  }

  return ((data ?? []) as BlogPostRow[]).map(mapBlogPost);
}

export async function createBlogPost(input: BlogPostInput): Promise<BlogPost> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .insert({
      title: input.title,
      slug: input.slug,
      content: input.content,
      image_url: input.imageUrl ?? null,
      published: input.published,
    })
    .select(BLOG_POST_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error("Failed to create blog post.");
  }

  return mapBlogPost(data as BlogPostRow);
}

export async function updateBlogPost(
  id: string,
  input: BlogPostInput
): Promise<BlogPost> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .update({
      title: input.title,
      slug: input.slug,
      content: input.content,
      image_url: input.imageUrl ?? null,
      published: input.published,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(BLOG_POST_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error("Failed to update blog post.");
  }

  return mapBlogPost(data as BlogPostRow);
}

export async function deleteBlogPost(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("blog_posts")
    .delete()
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    throw new Error("Failed to delete blog post.");
  }
}
