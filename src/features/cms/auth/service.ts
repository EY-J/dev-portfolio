import "server-only";

import type { User } from "@supabase/supabase-js";
import { unstable_rethrow } from "next/navigation";

import { getCmsSessionUserId } from "@/features/cms/auth/cms-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function authenticateWithPassword(email: string, password: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  return { success: !error };
}

export type AdminAccess =
  | { status: "signed_out"; user: null }
  | { status: "denied"; user: null }
  | { status: "allowed"; user: User };

async function getAdminIdentityAccess(): Promise<AdminAccess> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { status: "signed_out", user: null };

    const { data: allowed, error: authorizationError } = await supabase.rpc("current_portfolio_admin");
    if (authorizationError || allowed !== true) return { status: "denied", user: null };
    return { status: "allowed", user };
  } catch (error) {
    unstable_rethrow(error);
    return { status: "denied", user: null };
  }
}

// Used only after a fresh password sign-in, before the CMS window exists.
export async function getAdminIdentityForLogin(): Promise<User | null> {
  const access = await getAdminIdentityAccess();
  return access.status === "allowed" ? access.user : null;
}

export async function getAdminAccess(): Promise<AdminAccess> {
  const cmsUserId = await getCmsSessionUserId();
  if (!cmsUserId) return { status: "signed_out", user: null };

  const identity = await getAdminIdentityAccess();
  if (identity.status !== "allowed") return identity;
  if (identity.user.id !== cmsUserId) return { status: "signed_out", user: null };
  return identity;
}

export async function getAdminUser(): Promise<User | null> {
  const access = await getAdminAccess();
  return access.status === "allowed" ? access.user : null;
}

export async function requireAdmin(): Promise<User> {
  const user = await getAdminUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function createAuthorizedCmsClient(options?: { requireSitePublication?: boolean }) {
  const user = await requireAdmin();
  if (options?.requireSitePublication) {
    const { data, error } = await createAdminClient().rpc("get_site_publication_status", { p_actor: user.id });
    if (error || !data || typeof data !== "object" || data.editingEnabled !== true) {
      throw new Error("Site publication is not available. Apply the publication migration before editing portfolio content.");
    }
  }
  return createClient();
}
