import "server-only";

import type {
  PublicProfile,
  PublicProfileRow,
} from "@/features/website/profile/types";
import { createClient } from "@/lib/supabase/server";

const PUBLIC_PROFILE_COLUMNS =
  "id, name, title, bio, avatar_url, resume_url";

function mapPublicProfile(row: PublicProfileRow): PublicProfile {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    bio: row.bio,
    avatarUrl: row.avatar_url ?? undefined,
    resumeUrl: row.resume_url ?? undefined,
  };
}

export async function getPublicProfile(): Promise<PublicProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load profile.");
  }

  return data ? mapPublicProfile(data as PublicProfileRow) : null;
}
