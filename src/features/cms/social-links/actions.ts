"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser } from "@/features/cms/auth/service";
import {
  createSocialLink,
  deleteSocialLink,
  updateSocialLink,
} from "@/features/cms/social-links/service";
import type {
  SocialLinkActionState,
  SocialLinkInput,
} from "@/features/cms/social-links/types";

const SOCIAL_LINKS_PATH = "/admin/dashboard/social-links";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function parseSocialLinkInput(
  formData: FormData
): { input: SocialLinkInput; error: null } | { input: null; error: string } {
  const platform = readText(formData, "platform");
  const url = readText(formData, "url");
  const icon = readText(formData, "icon");

  if (!platform || !url || !icon) {
    return { input: null, error: "Platform, URL, and icon are required." };
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error();
    }
  } catch {
    return { input: null, error: "Enter a valid URL." };
  }

  return { input: { platform, url, icon }, error: null };
}

export async function createSocialLinkAction(
  _previousState: SocialLinkActionState,
  formData: FormData
): Promise<SocialLinkActionState> {
  if (!(await getAuthenticatedUser())) {
    return { success: false, message: "You must be signed in." };
  }

  const result = parseSocialLinkInput(formData);
  if (!result.input) {
    return { success: false, message: result.error };
  }

  try {
    await createSocialLink(result.input);
    revalidatePath(SOCIAL_LINKS_PATH);
    return { success: true, message: "Social link created." };
  } catch {
    return { success: false, message: "Unable to create the social link." };
  }
}

export async function updateSocialLinkAction(
  id: string,
  _previousState: SocialLinkActionState,
  formData: FormData
): Promise<SocialLinkActionState> {
  if (!(await getAuthenticatedUser())) {
    return { success: false, message: "You must be signed in." };
  }

  if (!UUID_PATTERN.test(id)) {
    return { success: false, message: "Invalid social link identifier." };
  }

  const result = parseSocialLinkInput(formData);
  if (!result.input) {
    return { success: false, message: result.error };
  }

  try {
    await updateSocialLink(id, result.input);
    revalidatePath(SOCIAL_LINKS_PATH);
    return { success: true, message: "Social link updated." };
  } catch {
    return { success: false, message: "Unable to update the social link." };
  }
}

export async function deleteSocialLinkAction(
  id: string
): Promise<SocialLinkActionState> {
  if (!(await getAuthenticatedUser())) {
    return { success: false, message: "You must be signed in." };
  }

  if (!UUID_PATTERN.test(id)) {
    return { success: false, message: "Invalid social link identifier." };
  }

  try {
    await deleteSocialLink(id);
    revalidatePath(SOCIAL_LINKS_PATH);
    return { success: true, message: "Social link deleted." };
  } catch {
    return { success: false, message: "Unable to delete the social link." };
  }
}
