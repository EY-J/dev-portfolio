"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/features/cms/auth/service";
import { createExperience, deleteExperience, moveExperience, updateExperience } from "@/features/experience/service";
import type { ExperienceActionState } from "@/features/experience/types";
import { parseExperienceInput } from "@/features/experience/validation";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unauthorized: ExperienceActionState = { success: false, message: "Admin access is required." };
function refresh() {
  revalidatePath("/admin/experience");
  revalidatePath("/authpreview");
  revalidatePath("/admin", "layout");
}

export async function createExperienceAction(_previous: ExperienceActionState, formData: FormData): Promise<ExperienceActionState> {
  if (!await getAdminUser()) return unauthorized;
  const result = parseExperienceInput(formData);
  if (!result.input) return result.error;
  try {
    await createExperience(result.input);
    refresh();
    return { success: true, message: "Experience added." };
  } catch { return { success: false, message: "Unable to save experience." }; }
}

export async function updateExperienceAction(id: string, _previous: ExperienceActionState, formData: FormData): Promise<ExperienceActionState> {
  if (!await getAdminUser()) return unauthorized;
  if (!uuid.test(id)) return { success: false, message: "Invalid experience identifier." };
  const result = parseExperienceInput(formData);
  if (!result.input) return result.error;
  try {
    await updateExperience(id, result.input);
    refresh();
    return { success: true, message: "Experience updated." };
  } catch { return { success: false, message: "Unable to save experience." }; }
}

export async function deleteExperienceAction(id: string): Promise<ExperienceActionState> {
  if (!await getAdminUser()) return unauthorized;
  if (!uuid.test(id)) return { success: false, message: "Invalid experience identifier." };
  try { await deleteExperience(id); refresh(); return { success: true, message: "Experience deleted." }; }
  catch { return { success: false, message: "Unable to delete experience." }; }
}

export async function moveExperienceAction(id: string, direction: "up" | "down"): Promise<ExperienceActionState> {
  if (!await getAdminUser()) return unauthorized;
  if (!uuid.test(id) || !["up", "down"].includes(direction)) return { success: false, message: "Invalid experience order." };
  try { await moveExperience(id, direction); refresh(); return { success: true, message: "Experience reordered." }; }
  catch { return { success: false, message: "Unable to reorder experience." }; }
}
