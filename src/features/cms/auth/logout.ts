"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export interface LogoutActionState {
  error: string | null;
}

export async function logout(): Promise<LogoutActionState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Admin logout failed", { category: "signout_error" });
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
