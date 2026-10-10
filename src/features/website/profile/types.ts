import type { Profile } from "@/types/profile";

export type PublicProfile = Pick<
  Profile,
  "name" | "title" | "bio" | "avatarUrl" | "resumeUrl"
> & { avatarAlt?: string };

export interface PublicProfileRow {
  name: string;
  title: string;
  bio: string;
  avatar_url: string | null;
  resume_url: string | null;
}
