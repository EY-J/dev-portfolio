import "server-only";

import type {
  SocialLinkInput,
  SocialLinkRow,
} from "@/features/cms/social-links/types";
import { getSocialPlatformKey } from "@/features/cms/social-links/platforms";
import { normalizeSocialUrl } from "@/features/portfolio/urls";
import { createAuthorizedCmsClient } from "@/features/cms/auth/service";
import type { SocialLink } from "@/types/social-link";

const SOCIAL_LINK_COLUMNS = "id, platform, url, icon, created_at";

function platformIdentity(value: string): string {
  return getSocialPlatformKey(value) ?? value.trim().toLowerCase();
}

async function assertNoDuplicate(
  supabase: Awaited<ReturnType<typeof createAuthorizedCmsClient>>,
  platform: string,
  exceptId?: string,
): Promise<void> {
  // Website / Other can represent several unrelated sites.
  if (platformIdentity(platform) === "other") return;
  const { data, error } = await supabase.from("social_links").select("id, platform");
  if (error) throw new Error("Unable to check social links.");
  if ((data ?? []).some((link) => link.id !== exceptId && platformIdentity(link.platform) === platformIdentity(platform))) {
    throw new Error("DUPLICATE_SOCIAL_PLATFORM");
  }
}

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
  const supabase = await createAuthorizedCmsClient();
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
  const supabase = await createAuthorizedCmsClient({ requireSitePublication: true });
  const platform = getSocialPlatformKey(input.platform);
  if (!platform) throw new Error("Invalid social platform.");
  if (!normalizeSocialUrl(input.url)) throw new Error("Invalid social URL.");
  await assertNoDuplicate(supabase, platform);
  const { data, error } = await supabase
    .from("social_links")
    .insert({ platform, url: input.url, icon: platform })
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
  const supabase = await createAuthorizedCmsClient({ requireSitePublication: true });
  const { data: previous, error: previousError } = await supabase.from("social_links")
    .select("platform, icon").eq("id", id).single();
  if (previousError || !previous) throw new Error("Social link not found.");
  const platform = getSocialPlatformKey(input.platform);
  if (!platform && input.platform !== previous.platform) throw new Error("Invalid social platform.");
  if (!normalizeSocialUrl(input.url)) throw new Error("Invalid social URL.");
  const storedPlatform = platform ?? previous.platform;
  await assertNoDuplicate(supabase, storedPlatform, id);
  const { data, error } = await supabase
    .from("social_links")
    .update({ platform: storedPlatform, url: input.url, icon: platform ?? previous.icon })
    .eq("id", id)
    .select(SOCIAL_LINK_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error("Failed to update social link.");
  }

  return mapSocialLink(data as SocialLinkRow);
}

export async function deleteSocialLink(id: string): Promise<void> {
  const supabase = await createAuthorizedCmsClient({ requireSitePublication: true });
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
