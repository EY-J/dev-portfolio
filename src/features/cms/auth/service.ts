import "server-only";

import type { User } from "@supabase/supabase-js";
import { unstable_rethrow } from "next/navigation";

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

export async function getAdminAccess(): Promise<AdminAccess> {
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

export async function getAdminUser(): Promise<User | null> {
  const access = await getAdminAccess();
  return access.status === "allowed" ? access.user : null;
}

export async function requireAdmin(): Promise<User> {
  const user = await getAdminUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function createAuthorizedCmsClient() {
  await requireAdmin();
  return createClient();
}
