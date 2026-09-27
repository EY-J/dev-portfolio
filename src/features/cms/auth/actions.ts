"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authenticateWithPassword, getAdminAccess } from "@/features/cms/auth/service";

export interface LoginActionState {
  success: boolean;
  error: string | null;
}

export async function login(
  _previousState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || !email.trim() || !email.includes("@")) {
    return { success: false, error: "Enter a valid email address." };
  }

  if (typeof password !== "string" || !password) {
    return { success: false, error: "Enter your password." };
  }

  let authenticated = false;

  try {
    const result = await authenticateWithPassword(email.trim(), password);
    authenticated = result.success;
  } catch {
    return {
      success: false,
      error: "Unable to sign in right now. Please try again.",
    };
  }

  if (!authenticated) {
    return { success: false, error: "Invalid email or password." };
  }

  try {
    if ((await getAdminAccess()).status !== "allowed") {
      return { success: false, error: "Access denied." };
    }
  } catch {
    return { success: false, error: "Unable to verify access right now." };
  }

  revalidatePath("/admin", "layout");
  redirect("/admin");
}
