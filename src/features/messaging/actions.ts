"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { addVisitorReply, createConversation, getConversationByPublicToken } from "@/features/messaging/service";
import { notifyConversationCreated, notifyOwnerVisitorMessage } from "@/features/messaging/email/notifications";
import { checkContactRateLimit, claimInquirySubmissionKey, checkVisitorConversationRateLimit, checkVisitorReplyIpRateLimit } from "@/features/messaging/rate-limit/service";
import { VISITOR_MESSAGE_SESSION_COOKIE, visitorMessageCookieOptions } from "@/features/messaging/session/cookie";
import { authorizeConversationForVisitorSession } from "@/features/messaging/session/service";
import type { ConversationWithMessages } from "@/features/messaging/types";
import { validateInquiry, validateReply } from "@/features/messaging/validation";

export interface MessagingActionState {
  error: string | null;
}

export type InquiryActionState =
  | { status: "idle" | "success"; error: null }
  | { status: "error" | "sent_without_session"; error: string };

export async function submitInquiry(
  _previousState: InquiryActionState,
  formData: FormData
): Promise<InquiryActionState> {
  const validation = validateInquiry(formData);
  if (!validation.value) return { status: "error", error: validation.error };

  let permitted: boolean;
  try {
    permitted = await checkContactRateLimit(validation.value.email);
  } catch {
    return { status: "error", error: "Unable to send your inquiry right now. Please try again later." };
  }
  if (!permitted) return { status: "error", error: "Too many requests. Please wait a while and try again." };

  // This atomic, one-use bucket prevents concurrent submits of the same form.
  // It is separate from the existing IP and email limits, which still apply.
  try {
    const key = formData.get("submissionKey");
    if (typeof key !== "string" || !(await claimInquirySubmissionKey(key))) {
      return { status: "error", error: "This message is already being sent. Please wait before trying again." };
    }
  } catch {
    return { status: "error", error: "Unable to send your inquiry right now. Please try again later." };
  }

  let token: string;
  let conversationId: string;
  try {
    const created = await createConversation(validation.value);
    token = created.token;
    conversationId = created.conversationId;
  } catch {
    return { status: "error", error: "Unable to send your inquiry right now. Please try again." };
  }

  let sessionReady = false;
  try {
    // The cookie is scoped to /messages, so a submission on / starts a new
    // session. The existing bearer email link can join prior conversations.
    const session = await authorizeConversationForVisitorSession(conversationId, null);
    (await cookies()).set(VISITOR_MESSAGE_SESSION_COOKIE, session.token, visitorMessageCookieOptions(session.expiresAt));
    sessionReady = true;
  } catch {
    console.warn("Visitor message session setup failed", { kind: "initial_inquiry" });
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
  return sessionReady
    ? { status: "success", error: null }
    : { status: "sent_without_session", error: "Message saved, but this browser could not open it. Use the private link in your confirmation email." };
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
