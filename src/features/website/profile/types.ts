import type { Profile } from "@/types/profile";

export type PublicProfile = Pick<
  Profile,
  "id" | "name" | "title" | "bio" | "avatarUrl" | "resumeUrl"
>;

export interface PublicProfileRow {
  id: string;
  name: string;
  title: string;
  bio: string;
  avatar_url: string | null;
  resume_url: string | null;
}
