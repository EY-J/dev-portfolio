import "server-only";

import { createClient } from "@/lib/supabase/server";
import { normalizeSocialUrl } from "@/features/portfolio/urls";

export interface PublicSocialLink {
  label: string;
  href: string;
}

export async function getPublicSocialLinks(): Promise<PublicSocialLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("social_links")
    .select("platform, url")
    .order("created_at", { ascending: true });
  if (error) throw new Error("Failed to load public links.");
  return (data ?? []).flatMap((link) => {
    const href = normalizeSocialUrl(link.url);
    return href ? [{ label: link.platform, href }] : [];
  });
}
