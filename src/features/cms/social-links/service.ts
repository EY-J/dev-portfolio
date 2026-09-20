import "server-only";

import type {
  SocialLinkInput,
  SocialLinkRow,
} from "@/features/cms/social-links/types";
import { createClient } from "@/lib/supabase/server";
import type { SocialLink } from "@/types/social-link";

const SOCIAL_LINK_COLUMNS = "id, platform, url, icon, created_at";

function mapSocialLink(row: SocialLinkRow): SocialLink {
  return {
    id: row.id,
    platform: row.platform,
    url: row.url,
    icon: row.icon,
    createdAt: new Date(row.created_at),
  };
}

export async function getSocialLinks(): Promise<SocialLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("social_links")
    .select(SOCIAL_LINK_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Failed to load social links.");
  }

  return ((data ?? []) as SocialLinkRow[]).map(mapSocialLink);
}

export async function createSocialLink(
  input: SocialLinkInput
): Promise<SocialLink> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("social_links")
    .insert(input)
    .select(SOCIAL_LINK_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error("Failed to create social link.");
  }

  return mapSocialLink(data as SocialLinkRow);
}

export async function updateSocialLink(
  id: string,
  input: SocialLinkInput
): Promise<SocialLink> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("social_links")
    .update(input)
    .eq("id", id)
    .select(SOCIAL_LINK_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error("Failed to update social link.");
  }

  return mapSocialLink(data as SocialLinkRow);
}

export async function deleteSocialLink(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("social_links")
    .delete()
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    throw new Error("Failed to delete social link.");
  }
}
