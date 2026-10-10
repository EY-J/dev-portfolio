"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { establishCmsSession } from "@/features/cms/auth/cms-session";
import { authenticateWithPassword, getAdminIdentityForLogin } from "@/features/cms/auth/service";

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
    const admin = await getAdminIdentityForLogin();
    if (!admin) {
      return { success: false, error: "Access denied." };
    }
    await establishCmsSession(admin.id);
  } catch {
    return { success: false, error: "Unable to complete CMS sign-in right now." };
  }

  revalidatePath("/admin", "layout");
  redirect("/admin");
}
