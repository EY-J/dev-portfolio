export interface ProfileInput {
  name: string;
  title: string;
  bio: string;
  avatarUrl?: string;
  resumeUrl?: string;
}

export interface ProfileRow {
  id: string;
  name: string;
  title: string;
  bio: string;
  avatar_url: string | null;
  resume_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileActionState {
  success: boolean;
  message: string | null;
}
