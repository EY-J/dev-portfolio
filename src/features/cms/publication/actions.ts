"use server";

import { refresh, revalidatePath } from "next/cache";

import { requireAdmin } from "@/features/cms/auth/service";
import { PublicationMediaError, PublicationValidationError, publishDraftSite } from "@/features/portfolio/site-publication";

export interface PublishActionState {
  success: boolean;
  message: string | null;
}

export async function publishChangesAction(_previousState: PublishActionState): Promise<PublishActionState> {
  void _previousState;
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "Admin access is required." };
  }

  try {
    await publishDraftSite();
  } catch (error) {
    if (error instanceof PublicationMediaError) {
      return { success: false, message: error.reason === "missing-source"
        ? "Draft media source is missing. Upload the image again and try publishing."
        : "Unable to prepare draft images for publication. Try again." };
    }
    if (error instanceof PublicationValidationError) {
      return { success: false, message: "The draft has incomplete or invalid content. Review it and try again." };
    }
    return { success: false, message: "Unable to publish changes. Review the draft and try again." };
  }

  try {
    revalidatePath("/");
    revalidatePath("/authpreview");
    refresh();
    return { success: true, message: "Changes published successfully." };
  } catch {
    return { success: true, message: "Changes were published. Refresh the public site if it still shows the previous version." };
  }
}
