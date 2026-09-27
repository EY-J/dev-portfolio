import "server-only";

import { sendTransactionalEmail, type EmailPayload } from "@/features/messaging/email/client";
import { appOrigin } from "@/features/messaging/email/notifications";
import { conversationRecoveryEmail } from "@/features/messaging/email/templates";
import { createConversationAccessTokens } from "@/features/messaging/service";
import { validateRecoveryEmail } from "@/features/messaging/validation";
import { createAdminClient } from "@/lib/supabase/admin";

interface RecoveryConversationRow {
  id: string;
  visitor_name: string;
  visitor_email: string;
  subject: string;
  status: string;
  created_at: string;
}

type Sender = (payload: EmailPayload) => Promise<void>;
export const RECOVERY_COOLDOWN_MS = 10 * 60 * 1000;

export function recoveryIdempotencyKey(conversationId: string, nowMs: number) {
  return `conversation-recovery/${conversationId}/${Math.floor(nowMs / RECOVERY_COOLDOWN_MS)}`;
}

export async function recoverConversationsByEmail(email: string, send: Sender = sendTransactionalEmail) {
  const normalized = validateRecoveryEmail(email);
  if (!normalized) return;

  const client = createAdminClient();
  const { data, error } = await client.rpc("find_portfolio_recovery_conversations", { p_email: normalized });
  if (error || !Array.isArray(data)) throw new Error("recovery_lookup_failed");
  const conversations = data as RecoveryConversationRow[];
  if (conversations.length === 0) return;

  // The oldest conversation is a stable anchor even when new inquiries arrive.
  const anchor = conversations[0];
  const nowMs = Date.now();
  const { data: recent, error: recentError } = await client
    .from("conversation_access_tokens")
    .select("id")
    .eq("conversation_id", anchor.id)
    .eq("purpose", "conversation_recovery")
    .is("revoked_at", null)
    .gte("created_at", new Date(nowMs - RECOVERY_COOLDOWN_MS).toISOString())
    .limit(1);
  if (recentError) throw new Error("recovery_cooldown_lookup_failed");
  if (recent?.length) return;

  const origin = appOrigin();
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("recovery_email_not_configured");

  const tokens = await createConversationAccessTokens(conversations.map((conversation) => conversation.id), "conversation_recovery");
  const items = conversations.map((conversation, index) => ({
    subject: conversation.subject,
    createdAt: new Date(conversation.created_at),
    closed: conversation.status === "closed",
    url: `${origin}/messages/${tokens[index].token}`,
  }));
  const template = conversationRecoveryEmail(anchor.visitor_name, items);
  await send({
    ...template,
    to: anchor.visitor_email,
    idempotencyKey: recoveryIdempotencyKey(anchor.id, nowMs),
  });
}
