import "server-only";

import { createAuthorizedCmsClient } from "@/features/cms/auth/service";
import { isPortfolioVariant, resolvePortfolioVariant, type PortfolioVariant } from "@/features/portfolio/variants";
import { createClient } from "@/lib/supabase/server";

const SETTING_ID = 1;

export async function getStoredPortfolioVariant(): Promise<PortfolioVariant | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolio_settings")
    .select("active_variant")
    .eq("id", SETTING_ID)
    .maybeSingle();

  if (error) throw new Error("Unable to read portfolio setting.");
  return isPortfolioVariant(data?.active_variant) ? data.active_variant : null;
}

export async function getActivePortfolioVariant(): Promise<PortfolioVariant> {
  try {
    return resolvePortfolioVariant(await getStoredPortfolioVariant());
  } catch {
    console.warn("Portfolio setting unavailable; using the main portfolio.");
    return "main";
  }
}

export async function setDraftPortfolioVariant(variant: PortfolioVariant): Promise<PortfolioVariant> {
  if (!isPortfolioVariant(variant)) throw new Error("Invalid portfolio variant.");

  // The authenticated client and table RLS both verify the admin allowlist.
  const supabase = await createAuthorizedCmsClient({ requireSitePublication: true });
  const { data, error } = await supabase
    .from("portfolio_settings")
    .update({ active_variant: variant, updated_at: new Date().toISOString() })
    .eq("id", SETTING_ID)
    .select("active_variant")
    .single();

  if (error || !isPortfolioVariant(data?.active_variant)) {
    throw new Error("Unable to update portfolio setting.");
  }

  return data.active_variant;
}
