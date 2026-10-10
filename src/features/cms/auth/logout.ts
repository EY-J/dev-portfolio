"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { clearCmsSession } from "@/features/cms/auth/cms-session";
import { createClient } from "@/lib/supabase/server";

export interface LogoutActionState {
  error: string | null;
}

export async function logout(): Promise<LogoutActionState> {
  let cmsClearFailed = false;
  try {
    await clearCmsSession();
  } catch (error) {
    unstable_rethrow(error);
    cmsClearFailed = true;
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (error || cmsClearFailed) {
      console.error("Admin logout failed", { category: error ? "signout_error" : "cms_cookie_error" });
      return { error: "Unable to log out right now. Please try again." };
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error("Admin logout failed", { category: "unexpected" });
    return { error: "Unable to log out right now. Please try again." };
  }

  revalidatePath("/admin", "layout");
  redirect("/admin");
}
