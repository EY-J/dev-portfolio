"use server";

import { revalidatePath } from "next/cache";

import { getAdminUser } from "@/features/cms/auth/service";
import { normalizeSocialUrl } from "@/features/portfolio/urls";
import { getSocialPlatformKey } from "@/features/cms/social-links/platforms";
import {
  createSocialLink,
  deleteSocialLink,
  updateSocialLink,
} from "@/features/cms/social-links/service";
import type {
  SocialLinkActionState,
  SocialLinkInput,
} from "@/features/cms/social-links/types";

const SOCIAL_LINKS_PATH = "/admin/social-links";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function parseSocialLinkInput(
  formData: FormData,
  allowLegacy = false,
): { input: SocialLinkInput; error: null } | { input: null; error: SocialLinkActionState } {
  const platform = readText(formData, "platform");
  const url = readText(formData, "url");
  const key = getSocialPlatformKey(platform);
  const fieldErrors = {
    ...(!platform || (!key && !allowLegacy) ? { platform: "Choose a platform." } : {}),
    ...(!normalizeSocialUrl(url) ? { url: "Enter a valid URL." } : {}),
  };
  if (Object.keys(fieldErrors).length) {
    return { input: null, error: { success: false, message: "Check the highlighted fields.", fieldErrors } };
  }
  return { input: { platform: key ?? platform, url }, error: null };
}

function saveError(error: unknown, fallback: string): SocialLinkActionState {
  if (error instanceof Error && error.message === "DUPLICATE_SOCIAL_PLATFORM") {
    const message = "A link for this platform already exists.";
    return { success: false, message, fieldErrors: { platform: message } };
  }
  return { success: false, message: fallback };
}

export async function createSocialLinkAction(
  _previousState: SocialLinkActionState,
  formData: FormData
): Promise<SocialLinkActionState> {
  if (!(await getAdminUser())) {
    return { success: false, message: "You must be signed in." };
  }

  const result = parseSocialLinkInput(formData);
  if (!result.input) {
    return result.error;
  }

  try {
    await createSocialLink(result.input);
    revalidatePath(SOCIAL_LINKS_PATH);
    revalidatePath("/authpreview");
    revalidatePath("/admin", "layout");
    return { success: true, message: "Social link added." };
  } catch (error) {
    return saveError(error, "Unable to save social link.");
  }
}

export async function updateSocialLinkAction(
  id: string,
  _previousState: SocialLinkActionState,
  formData: FormData
): Promise<SocialLinkActionState> {
  if (!(await getAdminUser())) {
    return { success: false, message: "You must be signed in." };
  }

  if (!UUID_PATTERN.test(id)) {
    return { success: false, message: "Invalid social link identifier." };
  }

  const result = parseSocialLinkInput(formData, true);
  if (!result.input) {
    return result.error;
  }

  try {
    await updateSocialLink(id, result.input);
    revalidatePath(SOCIAL_LINKS_PATH);
    revalidatePath("/authpreview");
    revalidatePath("/admin", "layout");
    return { success: true, message: "Social link updated." };
  } catch (error) {
    return saveError(error, "Unable to save social link.");
  }
}

export async function deleteSocialLinkAction(
  id: string
): Promise<SocialLinkActionState> {
  if (!(await getAdminUser())) {
    return { success: false, message: "You must be signed in." };
  }

  if (!UUID_PATTERN.test(id)) {
    return { success: false, message: "Invalid social link identifier." };
  }

  try {
    await deleteSocialLink(id);
    revalidatePath(SOCIAL_LINKS_PATH);
    revalidatePath("/authpreview");
    revalidatePath("/admin", "layout");
    return { success: true, message: "Social link deleted." };
  } catch {
    return { success: false, message: "Unable to delete social link." };
  }
}
