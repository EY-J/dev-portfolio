"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/features/cms/auth/service";
import { setDraftPortfolioVariant } from "@/features/portfolio/variant-service";
import { isPortfolioVariant, type PortfolioVariant } from "@/features/portfolio/variants";

export interface PortfolioVariantActionState {
  status: "idle" | "success" | "error";
  variant: PortfolioVariant | null;
  message: string | null;
}

export async function saveDraftPortfolioVariant(
  previousState: PortfolioVariantActionState,
  formData: FormData,
): Promise<PortfolioVariantActionState> {
  try {
    await requireAdmin();
  } catch {
    return { ...previousState, status: "error", message: "Admin access is required." };
  }

  const requested = formData.get("variant");
  if (!isPortfolioVariant(requested)) {
    return { ...previousState, status: "error", message: "Choose a valid portfolio." };
  }

  try {
    const variant = await setDraftPortfolioVariant(requested);
    revalidatePath("/admin/settings");
    revalidatePath("/authpreview");
    revalidatePath("/admin", "layout");
    return { status: "success", variant, message: `${variant === "main" ? "Main" : "Simple"} Portfolio saved to draft.` };
  } catch {
    return { ...previousState, status: "error", message: "Unable to save the portfolio draft right now." };
  }
}
