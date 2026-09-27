import "server-only";

import { sendTransactionalEmail, type EmailPayload } from "@/features/messaging/email/client";
import { adminReplyEmail, conversationCreatedEmail, ownerVisitorMessageEmail } from "@/features/messaging/email/templates";
import { createConversationAccessToken } from "@/features/messaging/service";
import type { Conversation } from "@/features/messaging/types";

type Sender = (payload: EmailPayload) => Promise<void>;
type NotificationConversation = Pick<Conversation, "id" | "visitorName" | "visitorEmail" | "subject">;

export function appOrigin() {
  const configured = process.env.APP_URL;
  if (!configured) throw new Error("app_url_not_configured");
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("app_url_invalid");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("app_url_requires_https");
  }
  if (process.env.NODE_ENV === "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("app_url_requires_public_origin");
  }
  return url.origin;
}

function logNotificationFailure(kind: string, conversationId: string, error: unknown) {
  const category = error instanceof Error && /^[a-zA-Z0-9_]+$/.test(error.message) ? error.message : "unexpected";
  console.warn("Email notification failed", { kind, conversationId, category });
}

async function attempt(kind: string, conversationId: string, work: () => Promise<void>) {
  try {
    await work();
    return true;
  } catch (error) {
    logNotificationFailure(kind, conversationId, error);
    return false;
  }
}

export async function notifyConversationCreated(input: { conversationId: string; name: string; email: string; subject: string; token: string }, send: Sender = sendTransactionalEmail) {
  return attempt("conversation_created", input.conversationId, async () => {
    const template = conversationCreatedEmail(input.name, input.subject, `${appOrigin()}/messages/${input.token}`);
    await send({ ...template, to: input.email, idempotencyKey: `conversation-created/${input.conversationId}` });
  });
}

export async function notifyAdminReply(conversation: NotificationConversation, messageId: string, send: Sender = sendTransactionalEmail) {
  return attempt("admin_reply", conversation.id, async () => {
    // Validate configuration before issuing a bearer token.
    const origin = appOrigin();
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("email_not_configured");
    const token = await createConversationAccessToken(conversation.id, "email_notification");
    const template = adminReplyEmail(conversation.visitorName, conversation.subject, `${origin}/messages/${token}`);
    await send({ ...template, to: conversation.visitorEmail, idempotencyKey: `admin-reply/${messageId}` });
  });
}

export async function notifyOwnerVisitorMessage(conversation: NotificationConversation, eventId: string, initial: boolean, send: Sender = sendTransactionalEmail) {
  const ownerEmail = process.env.PORTFOLIO_OWNER_EMAIL;
  if (!ownerEmail) return true;
  return attempt(initial ? "owner_inquiry" : "owner_visitor_reply", conversation.id, async () => {
    const template = ownerVisitorMessageEmail(conversation.visitorName, conversation.subject, `${appOrigin()}/admin/messages`, initial);
    await send({ ...template, to: ownerEmail, idempotencyKey: initial ? `conversation-owner/${eventId}` : `visitor-reply-owner/${eventId}` });
  });
}
