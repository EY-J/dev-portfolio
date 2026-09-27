"use server";

import { after } from "next/server";

import { recoverConversationsByEmail } from "@/features/messaging/recovery/service";
import { checkRecoveryRateLimit } from "@/features/messaging/rate-limit/service";
import { validateRecoveryEmail } from "@/features/messaging/validation";

export interface RecoveryActionState {
  submitted: boolean;
}

export async function submitConversationRecovery(
  _previousState: RecoveryActionState,
  formData: FormData
): Promise<RecoveryActionState> {
  const email = validateRecoveryEmail(formData.get("email"));
  if (email) {
    after(async () => {
      try {
        if (!(await checkRecoveryRateLimit(email))) return;
        await recoverConversationsByEmail(email);
      } catch (error) {
        const category = error instanceof Error && /^recovery_[a-z_]+$/.test(error.message)
          ? error.message : "recovery_unexpected";
        console.warn("Conversation recovery failed", { category });
      }
    });
  }
  return { submitted: true };
}
