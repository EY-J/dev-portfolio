"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { addVisitorReply, createConversation, getConversationByPublicToken } from "@/features/messaging/service";
import { notifyConversationCreated, notifyOwnerVisitorMessage } from "@/features/messaging/email/notifications";
import { checkContactRateLimit, checkVisitorConversationRateLimit, checkVisitorReplyIpRateLimit } from "@/features/messaging/rate-limit/service";
import type { ConversationWithMessages } from "@/features/messaging/types";
import { validateInquiry, validateReply } from "@/features/messaging/validation";

export interface MessagingActionState {
  error: string | null;
}

export async function submitInquiry(
  _previousState: MessagingActionState,
  formData: FormData
): Promise<MessagingActionState> {
  const validation = validateInquiry(formData);
  if (!validation.value) return { error: validation.error };

  let permitted: boolean;
  try {
    permitted = await checkContactRateLimit(validation.value.email);
  } catch {
    return { error: "Unable to send your inquiry right now. Please try again later." };
  }
  if (!permitted) return { error: "Too many requests. Please wait a while and try again." };

  let token: string;
  let conversationId: string;
  try {
    const created = await createConversation(validation.value);
    token = created.token;
    conversationId = created.conversationId;
  } catch {
    return { error: "Unable to send your inquiry right now. Please try again." };
  }

  await notifyConversationCreated({
    conversationId,
    name: validation.value.name,
    email: validation.value.email,
    subject: validation.value.subject,
    token,
  });
  await notifyOwnerVisitorMessage({
    id: conversationId,
    visitorName: validation.value.name,
    visitorEmail: validation.value.email,
    subject: validation.value.subject,
  }, conversationId, true);
  redirect(`/messages/${token}`, "replace");
}

export async function submitVisitorReply(
  token: string,
  _previousState: MessagingActionState,
  formData: FormData
): Promise<MessagingActionState> {
  const body = validateReply(formData.get("body"));
  if (!body) return { error: "Write a reply of 1 to 5,000 characters." };

  let ipPermitted: boolean;
  try {
    ipPermitted = await checkVisitorReplyIpRateLimit();
  } catch {
    return { error: "Unable to send your reply right now. Please try again later." };
  }
  if (!ipPermitted) return { error: "You're sending messages too quickly. Please wait and try again." };

  let conversation: ConversationWithMessages | null;
  try {
    conversation = await getConversationByPublicToken(token);
  } catch {
    return { error: "Unable to send your reply right now. Please try again later." };
  }
  if (!conversation) return { error: "Conversation not found or no longer available." };

  let conversationPermitted: boolean;
  try {
    conversationPermitted = await checkVisitorConversationRateLimit(conversation.id);
  } catch {
    return { error: "Unable to send your reply right now. Please try again later." };
  }
  if (!conversationPermitted) return { error: "You're sending messages too quickly. Please wait and try again." };

  let messageId: string;
  try {
    const savedId = await addVisitorReply(token, body);
    if (!savedId) {
      return { error: "Conversation not found or no longer available." };
    }
    messageId = savedId;
  } catch {
    return { error: "Unable to send your reply right now. Please try again." };
  }

  if (process.env.PORTFOLIO_OWNER_EMAIL) {
    try {
      const conversation = await getConversationByPublicToken(token);
      if (conversation) await notifyOwnerVisitorMessage(conversation, messageId, false);
    } catch {
      console.warn("Owner notification lookup failed", { kind: "visitor_reply" });
    }
  }
  revalidatePath(`/messages/${token}`);
  redirect(`/messages/${token}`);
}
