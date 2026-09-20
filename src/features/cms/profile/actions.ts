"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser } from "@/features/cms/auth/service";
import { updateProfile } from "@/features/cms/profile/service";
import type {
  ProfileActionState,
  ProfileInput,
} from "@/features/cms/profile/types";

const PROFILE_PATH = "/admin/dashboard/profile";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseProfileInput(
  formData: FormData
): { input: ProfileInput; error: null } | { input: null; error: string } {
  const name = readText(formData, "name");
  const title = readText(formData, "title");
  const bio = readText(formData, "bio");
  const avatarUrl = readText(formData, "avatar_url");
  const resumeUrl = readText(formData, "resume_url");

  if (!name || !title || !bio) {
    return { input: null, error: "Name, title, and bio are required." };
  }

  if (avatarUrl && !isHttpUrl(avatarUrl)) {
    return { input: null, error: "Enter a valid avatar URL." };
  }

  if (resumeUrl && !isHttpUrl(resumeUrl)) {
    return { input: null, error: "Enter a valid resume URL." };
  }

  return {
    input: {
      name,
      title,
      bio,
      avatarUrl: avatarUrl || undefined,
      resumeUrl: resumeUrl || undefined,
    },
    error: null,
  };
}

export async function updateProfileAction(
  id: string,
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  if (!(await getAuthenticatedUser())) {
    return { success: false, message: "You must be signed in." };
  }

  if (!UUID_PATTERN.test(id)) {
    return { success: false, message: "Invalid profile identifier." };
  }

  const result = parseProfileInput(formData);
  if (!result.input) {
    return { success: false, message: result.error };
  }

  try {
    await updateProfile(id, result.input);
    revalidatePath(PROFILE_PATH);
    return { success: true, message: "Profile updated." };
  } catch {
    return { success: false, message: "Unable to update the profile." };
  }
}
