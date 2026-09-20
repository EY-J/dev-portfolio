"use server";

import { authenticateWithPassword } from "@/features/cms/auth/service";

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

  try {
    const result = await authenticateWithPassword(email.trim(), password);

    if (!result.success) {
      return { success: false, error: "Invalid email or password." };
    }

    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Unable to sign in right now. Please try again.",
    };
  }
}
