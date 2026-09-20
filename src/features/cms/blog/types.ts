export interface BlogPostInput {
  title: string;
  slug: string;
  content: string;
  imageUrl?: string;
  published: boolean;
}

export interface BlogPostRow {
  id: string;
  title: string;
  slug: string;
  content: string;
  image_url: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface BlogActionState {
  success: boolean;
  message: string | null;
}
