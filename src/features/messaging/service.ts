import "server-only";

import { createAuthorizedCmsClient, requireAdmin } from "@/features/cms/auth/service";
import { generateConversationToken, hashConversationToken, isConversationToken } from "@/features/messaging/lib/token";
import type { Conversation, ConversationMessage, ConversationStatus, ConversationWithMessages, CreatedConversation, SenderType } from "@/features/messaging/types";
import type { InquiryInput } from "@/features/messaging/validation";
import { createAdminClient } from "@/lib/supabase/admin";

interface ConversationRow {
  id: string;
  realtime_topic_id: string;
  visitor_name: string;
  visitor_email: string;
  subject: string;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  conversation_messages?: MessageRow[];
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  body: string;
  created_at: string;
  read_at: string | null;
}

const CONVERSATION_COLUMNS = "id, realtime_topic_id, visitor_name, visitor_email, subject, status, created_at, updated_at, last_message_at";
const MESSAGE_COLUMNS = "id, conversation_id, sender_type, body, created_at, read_at";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    realtimeTopicId: row.realtime_topic_id,
    visitorName: row.visitor_name,
    visitorEmail: row.visitor_email,
    subject: row.subject,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastMessageAt: new Date(row.last_message_at),
  };
}

function mapMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderType: row.sender_type,
    body: row.body,
    createdAt: new Date(row.created_at),
    readAt: row.read_at ? new Date(row.read_at) : null,
  };
}

function mapThread(row: ConversationRow): ConversationWithMessages {
  return {
    ...mapConversation(row),
    messages: (row.conversation_messages ?? [])
      .map(mapMessage)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
  };
}

async function getCmsClient() {
  return createAuthorizedCmsClient();
}

export async function createConversation(input: InquiryInput): Promise<CreatedConversation> {
  const token = generateConversationToken();
  const client = createAdminClient();
  const { data, error } = await client.rpc("create_portfolio_conversation", {
    p_name: input.name,
    p_email: input.email,
    p_subject: input.subject,
    p_message: input.message,
    p_token_hash: hashConversationToken(token),
  });

  if (error || typeof data !== "string") {
    throw new Error("Unable to create conversation.");
  }

  return { conversationId: data, subject: input.subject, token };
}

export async function getConversationByPublicToken(token: string): Promise<ConversationWithMessages | null> {
  if (!isConversationToken(token)) return null;

  const client = createAdminClient();
  const { data, error } = await client
    .from("conversations")
    .select(`${CONVERSATION_COLUMNS}, conversation_messages(${MESSAGE_COLUMNS})`)
    .eq("public_token_hash", hashConversationToken(token))
    .maybeSingle();

  if (error) throw new Error("Unable to load conversation.");
  if (data) return mapThread(data as unknown as ConversationRow);

  const { data: access, error: accessError } = await client
    .from("conversation_access_tokens")
    .select("conversation_id")
    .eq("token_hash", hashConversationToken(token))
    .in("purpose", ["email_notification", "conversation_recovery"])
    .is("revoked_at", null)
    .maybeSingle();
  if (accessError) throw new Error("Unable to load conversation.");
  if (!access) return null;

  const { data: linked, error: linkedError } = await client
    .from("conversations")
    .select(`${CONVERSATION_COLUMNS}, conversation_messages(${MESSAGE_COLUMNS})`)
    .eq("id", access.conversation_id)
    .maybeSingle();
  if (linkedError) throw new Error("Unable to load conversation.");
  return linked ? mapThread(linked as unknown as ConversationRow) : null;
}

export type ConversationAccessPurpose = "email_notification" | "conversation_recovery";

export async function createConversationAccessToken(conversationId: string, purpose: ConversationAccessPurpose) {
  if (purpose === "email_notification") await requireAdmin();
  if (!UUID_PATTERN.test(conversationId)) throw new Error("Invalid conversation identifier.");
  const token = generateConversationToken();
  const { error } = await createAdminClient().from("conversation_access_tokens").insert({
    conversation_id: conversationId,
    token_hash: hashConversationToken(token),
    purpose,
  });
  if (error) throw new Error("Unable to create conversation access token.");
  return token;
}

export async function createConversationAccessTokens(conversationIds: string[], purpose: ConversationAccessPurpose) {
  if (conversationIds.length === 0) return [];
  if (conversationIds.some((id) => !UUID_PATTERN.test(id)) || new Set(conversationIds).size !== conversationIds.length) {
    throw new Error("Invalid conversation identifiers.");
  }

  const tokens = conversationIds.map((conversationId) => ({ conversationId, token: generateConversationToken() }));
  const { error } = await createAdminClient().from("conversation_access_tokens").insert(tokens.map(({ conversationId, token }) => ({
    conversation_id: conversationId,
    token_hash: hashConversationToken(token),
    purpose,
  })));
  if (error) throw new Error("Unable to create conversation access tokens.");
  return tokens;
}

export async function addVisitorReply(token: string, body: string): Promise<string | null> {
  if (!isConversationToken(token)) return null;

  const { data, error } = await createAdminClient().rpc("add_portfolio_visitor_reply_v2", {
    p_token_hash: hashConversationToken(token),
    p_body: body,
  });

  if (error) throw new Error("Unable to send reply.");
  return typeof data === "string" ? data : null;
}

export async function getAdminConversations(): Promise<ConversationWithMessages[]> {
  const client = await getCmsClient();
  const { data, error } = await client
    .from("conversations")
    .select(`${CONVERSATION_COLUMNS}, conversation_messages(${MESSAGE_COLUMNS})`)
    .order("last_message_at", { ascending: false });

  if (error) throw new Error("Unable to load conversations.");
  return ((data ?? []) as unknown as ConversationRow[]).map(mapThread);
}

export async function getAdminConversation(id: string): Promise<ConversationWithMessages | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const client = await getCmsClient();
  const { data, error } = await client
    .from("conversations")
    .select(`${CONVERSATION_COLUMNS}, conversation_messages(${MESSAGE_COLUMNS})`)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("Unable to load conversation.");
  return data ? mapThread(data as unknown as ConversationRow) : null;
}

export async function addAdminReply(conversationId: string, body: string): Promise<string | null> {
  if (!UUID_PATTERN.test(conversationId)) return null;
  const client = await getCmsClient();
  const { data, error } = await client.rpc("add_portfolio_admin_reply_v2", {
    p_conversation_id: conversationId,
    p_body: body,
  });

  if (error) throw new Error("Unable to send reply.");
  return typeof data === "string" ? data : null;
}

export async function markConversationRead(conversationId: string): Promise<boolean> {
  if (!UUID_PATTERN.test(conversationId)) return false;
  const client = await getCmsClient();
  const { data, error } = await client.rpc("mark_portfolio_conversation_read", {
    p_conversation_id: conversationId,
  });

  if (error) throw new Error("Unable to mark conversation read.");
  return data === true;
}

export async function closeConversation(conversationId: string): Promise<boolean> {
  if (!UUID_PATTERN.test(conversationId)) return false;
  const client = await getCmsClient();
  const { data, error } = await client.rpc("close_portfolio_conversation", {
    p_conversation_id: conversationId,
  });

  if (error) throw new Error("Unable to close conversation.");
  return data === true;
}

export async function deleteClosedConversation(conversationId: string): Promise<boolean> {
  if (!UUID_PATTERN.test(conversationId)) return false;
  const client = await getCmsClient();
  const { data, error } = await client.rpc("delete_portfolio_conversation", {
    p_conversation_id: conversationId,
  });

  if (error) throw new Error("Unable to delete conversation.");
  return data === true;
}
