export interface ProjectInput {
  title: string;
  description: string;
  imageUrl: string;
  technologies: string[];
  githubUrl?: string;
  liveUrl?: string;
}

export interface ProjectRow {
  id: string;
  title: string;
  description: string;
  image_url: string;
  technologies: string[];
  github_url: string | null;
  live_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectActionState {
  success: boolean;
  message: string | null;
}
