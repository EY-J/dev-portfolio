"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { notifyOwnerVisitorMessage } from "@/features/messaging/email/notifications";
import { checkVisitorConversationRateLimit, checkVisitorReplyIpRateLimit } from "@/features/messaging/rate-limit/service";
import { clearVisitorMessageSessionCookie, readVisitorMessageSessionCookie } from "@/features/messaging/session/cookie";
import { addVisitorSessionReply, getVisitorSessionConversation, revokeVisitorSession } from "@/features/messaging/session/service";
import { validateReply } from "@/features/messaging/validation";

export interface VisitorSessionActionState {
  error: string | null;
}

export async function submitSessionVisitorReply(
  conversationId: string,
  _previousState: VisitorSessionActionState,
  formData: FormData,
): Promise<VisitorSessionActionState> {
  const body = validateReply(formData.get("body"));
  if (!body) return { error: "Write a reply of 1 to 5,000 characters." };

  try {
    if (!(await checkVisitorReplyIpRateLimit())) {
      return { error: "You're sending messages too quickly. Please wait and try again." };
    }
  } catch {
    return { error: "Unable to send your reply right now. Please try again later." };
  }

  const token = await readVisitorMessageSessionCookie();
  let conversation;
  try {
    conversation = await getVisitorSessionConversation(token, conversationId);
  } catch {
    return { error: "Unable to send your reply right now. Please try again later." };
  }
  if (!conversation || conversation.status === "closed") {
    return { error: "Conversation not found or no longer available." };
  }

  try {
    if (!(await checkVisitorConversationRateLimit(conversation.id))) {
      return { error: "You're sending messages too quickly. Please wait and try again." };
    }
  } catch {
    return { error: "Unable to send your reply right now. Please try again later." };
  }

  let messageId: string;
  try {
    const savedId = await addVisitorSessionReply(token, conversation.id, body);
    if (!savedId) return { error: "Conversation not found or no longer available." };
    messageId = savedId;
  } catch {
    return { error: "Unable to send your reply right now. Please try again." };
  }

  if (process.env.PORTFOLIO_OWNER_EMAIL) {
    await notifyOwnerVisitorMessage(conversation, messageId, false);
  }
  revalidatePath("/messages");
  redirect(`/messages?conversation=${conversation.id}`);
}

export async function forgetThisDevice(_previousState: VisitorSessionActionState): Promise<VisitorSessionActionState> {
  void _previousState;
  const token = await readVisitorMessageSessionCookie();
  try {
    await revokeVisitorSession(token);
  } catch {
    return { error: "Unable to forget this device right now. Please try again." };
  }
  await clearVisitorMessageSessionCookie();
  revalidatePath("/messages");
  redirect("/messages");
}
