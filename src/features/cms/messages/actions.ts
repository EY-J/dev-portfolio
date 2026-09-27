"use server";

import { revalidatePath } from "next/cache";

import { getAdminUser } from "@/features/cms/auth/service";
import { updateMessageStatus } from "@/features/cms/messages/service";
import type { MessageActionState } from "@/features/cms/messages/types";
import type { MessageStatus } from "@/types/message";

const MESSAGES_PATH = "/admin/messages";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MESSAGE_STATUSES: MessageStatus[] = ["unread", "read", "archived"];

export async function updateMessageStatusAction(
  id: string,
  _previousState: MessageActionState,
  formData: FormData
): Promise<MessageActionState> {
  if (!(await getAdminUser())) {
    return { success: false, message: "You must be signed in." };
  }

  if (!UUID_PATTERN.test(id)) {
    return { success: false, message: "Invalid message identifier." };
  }

  const status = formData.get("status");
  if (
    typeof status !== "string" ||
    !MESSAGE_STATUSES.includes(status as MessageStatus)
  ) {
    return { success: false, message: "Select a valid message status." };
  }

  try {
    await updateMessageStatus(id, status as MessageStatus);
    revalidatePath(MESSAGES_PATH);
    return { success: true, message: "Message status updated." };
  } catch {
    return { success: false, message: "Unable to update message status." };
  }
}
