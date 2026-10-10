import "server-only";

import type { ProfileInput, ProfileRow } from "@/features/cms/profile/types";
import { createAuthorizedCmsClient } from "@/features/cms/auth/service";
import type { Profile } from "@/types/profile";

const PROFILE_COLUMNS =
  "id, name, title, bio, avatar_url, resume_url, created_at, updated_at";
// A fixed ID makes concurrent first saves contend for one row instead of
// creating multiple portfolio profiles.
const CANONICAL_PROFILE_ID = "00000000-0000-4000-8000-000000000001";

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    bio: row.bio,
    avatarUrl: row.avatar_url ?? undefined,
    resumeUrl: row.resume_url ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createAuthorizedCmsClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load profile.");
  }

  return data ? mapProfile(data as ProfileRow) : null;
}

export async function createProfile(input: ProfileInput): Promise<Profile> {
  const supabase = await createAuthorizedCmsClient({ requireSitePublication: true });
  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (readError) throw new Error("Failed to check the profile.");
  if (existing) throw new Error("A profile already exists.");

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: CANONICAL_PROFILE_ID,
      name: input.name,
      title: input.title,
      bio: input.bio,
      avatar_url: input.avatarUrl ?? null,
      resume_url: input.resumeUrl ?? null,
      created_at: now,
      updated_at: now,
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (error || !data) throw new Error("Failed to create profile.");
  return mapProfile(data as ProfileRow);
}

export async function updateProfile(
  id: string,
  input: ProfileInput
): Promise<Profile> {
  const supabase = await createAuthorizedCmsClient({ requireSitePublication: true });
  const { data: canonical, error: readError } = await supabase
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (readError || canonical?.id !== id) {
    throw new Error("Failed to find the portfolio profile.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      name: input.name,
      title: input.title,
      bio: input.bio,
      avatar_url: input.avatarUrl ?? null,
      resume_url: input.resumeUrl ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(PROFILE_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error("Failed to update profile.");
  }

  return mapProfile(data as ProfileRow);
}
