"use server";

import { revalidatePath } from "next/cache";

import { getAdminUser } from "@/features/cms/auth/service";
import { normalizeAssetUrl } from "@/features/portfolio/urls";
import { createProfile, updateProfile } from "@/features/cms/profile/service";
import type {
  ProfileActionState,
  ProfileInput,
} from "@/features/cms/profile/types";

const PROFILE_PATH = "/admin/profile";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function parseProfileInput(
  formData: FormData
): { input: ProfileInput; error: null } | { input: null; error: string } {
  const name = readText(formData, "name");
  const title = readText(formData, "title");
  const bio = readText(formData, "bio");
  const avatarUrl = readText(formData, "avatar_url");
  const avatarRemoved = formData.get("avatar_image_removed") === "1";
  const resumeUrl = readText(formData, "resume_url");

  if (!name || !title) {
    return { input: null, error: "Full name and professional title are required." };
  }

  if (name.length > 120 || title.length > 160 || bio.length > 5000) {
    return { input: null, error: "Profile text is too long." };
  }

  if (avatarUrl.length > 2000 || resumeUrl.length > 2000) {
    return { input: null, error: "Profile URL is too long." };
  }

  if (avatarUrl && !normalizeAssetUrl(avatarUrl)) {
    return { input: null, error: "Enter a valid avatar URL." };
  }

  if (resumeUrl && !normalizeAssetUrl(resumeUrl)) {
    return { input: null, error: "Enter a valid resume URL." };
  }

  return {
    input: {
      name,
      title,
      bio,
      avatarUrl: avatarUrl || (avatarRemoved ? "" : undefined),
      resumeUrl: resumeUrl || undefined,
    },
    error: null,
  };
}

function revalidateProfilePages() {
  revalidatePath(PROFILE_PATH);
  revalidatePath("/authpreview");
  revalidatePath("/admin", "layout");
}

export async function createProfileAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  if (!(await getAdminUser())) {
    return { success: false, message: "You must be signed in." };
  }

  const result = parseProfileInput(formData);
  if (!result.input) return { success: false, message: result.error };

  try {
    await createProfile(result.input);
    revalidateProfilePages();
    return { success: true, message: "Profile saved to draft." };
  } catch {
    return { success: false, message: "Unable to create the profile. Refresh the page and try again." };
  }
}

export async function updateProfileAction(
  id: string,
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  if (!(await getAdminUser())) {
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
    revalidateProfilePages();
    return { success: true, message: "Profile saved to draft." };
  } catch {
    return { success: false, message: "Unable to update the profile." };
  }
}
