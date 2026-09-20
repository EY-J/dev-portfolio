import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function authenticateWithPassword(email: string, password: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  return { success: !error };
}

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return error ? null : user;
}
