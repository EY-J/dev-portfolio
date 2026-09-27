import "server-only";

import { createClient } from "@/lib/supabase/server";

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
    try {
      const url = new URL(link.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") return [];
      return [{ label: link.platform, href: url.href }];
    } catch {
      return [];
    }
  });
}
