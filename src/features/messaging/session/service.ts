import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { VISITOR_MESSAGE_SESSION_DAYS } from "@/features/messaging/session/cookie";
import type { ConversationStatus, ConversationWithMessages, SenderType } from "@/features/messaging/types";
import { createAdminClient } from "@/lib/supabase/admin";

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const THREAD_COLUMNS = "id, realtime_topic_id, visitor_name, visitor_email, subject, status, created_at, updated_at, last_message_at, conversation_messages(id, conversation_id, sender_type, body, created_at, read_at)";

interface SessionRow {
  id: string;
}

interface ThreadRow {
  id: string;
  realtime_topic_id: string;
  visitor_name: string;
  visitor_email: string;
  subject: string;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  conversation_messages: {
    id: string;
    conversation_id: string;
    sender_type: SenderType;
    body: string;
    created_at: string;
    read_at: string | null;
  }[];
}

function mapThread(row: ThreadRow): ConversationWithMessages {
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
    messages: row.conversation_messages.map((message) => ({
      id: message.id,
      conversationId: message.conversation_id,
      senderType: message.sender_type,
      body: message.body,
      createdAt: new Date(message.created_at),
      readAt: message.read_at ? new Date(message.read_at) : null,
    })).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
  };
}

export function generateVisitorSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function isVisitorSessionToken(value: string | null): value is string {
  return typeof value === "string" && SESSION_TOKEN_PATTERN.test(value);
}

export function hashVisitorSessionToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function resolveVisitorSession(rawToken: string | null): Promise<SessionRow | null> {
  if (!isVisitorSessionToken(rawToken)) return null;
  const { data, error } = await createAdminClient()
    .from("visitor_message_sessions")
    .select("id")
    .eq("session_token_hash", hashVisitorSessionToken(rawToken))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error("visitor_session_lookup_failed");
  return data as SessionRow | null;
}

export async function authorizeConversationForVisitorSession(conversationId: string, existingToken: string | null) {
  if (!UUID_PATTERN.test(conversationId)) throw new Error("visitor_session_conversation_invalid");
  const expiresAt = new Date(Date.now() + VISITOR_MESSAGE_SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = generateVisitorSessionToken();
  const { data, error } = await createAdminClient().rpc("bootstrap_portfolio_visitor_message_session", {
    p_existing_hash: isVisitorSessionToken(existingToken) ? hashVisitorSessionToken(existingToken) : null,
    p_new_hash: hashVisitorSessionToken(token),
    p_conversation_id: conversationId,
    p_expires_at: expiresAt.toISOString(),
  });
  if (error || typeof data !== "string") throw new Error("visitor_session_authorize_failed");
  return { token, expiresAt };
}

export async function getVisitorSessionConversations(rawToken: string | null): Promise<ConversationWithMessages[]> {
  const session = await resolveVisitorSession(rawToken);
  if (!session) return [];
  const client = createAdminClient();
  const { data: mappings, error: mappingError } = await client.from("visitor_message_session_conversations")
    .select("conversation_id")
    .eq("session_id", session.id)
    .order("last_opened_at", { ascending: false });
  if (mappingError) throw new Error("visitor_session_mapping_lookup_failed");
  const ids = (mappings ?? []).map((mapping) => mapping.conversation_id);
  if (ids.length === 0) return [];
  const { data, error } = await client.from("conversations")
    .select(THREAD_COLUMNS)
    .in("id", ids);
  if (error) throw new Error("visitor_session_threads_failed");
  const byId = new Map(((data ?? []) as unknown as ThreadRow[]).map((row) => [row.id, mapThread(row)]));
  return ids.flatMap((id) => {
    const conversation = byId.get(id);
    return conversation ? [conversation] : [];
  });
}

export async function getVisitorSessionConversation(rawToken: string | null, conversationId: string) {
  if (!UUID_PATTERN.test(conversationId)) return null;
  const conversations = await getVisitorSessionConversations(rawToken);
  return conversations.find((conversation) => conversation.id === conversationId) ?? null;
}

export async function addVisitorSessionReply(rawToken: string | null, conversationId: string, body: string) {
  if (!isVisitorSessionToken(rawToken) || !UUID_PATTERN.test(conversationId)) return null;
  const { data, error } = await createAdminClient().rpc("add_portfolio_visitor_session_reply", {
    p_session_hash: hashVisitorSessionToken(rawToken),
    p_conversation_id: conversationId,
    p_body: body,
  });
  if (error) throw new Error("visitor_session_reply_failed");
  return typeof data === "string" ? data : null;
}

export async function revokeVisitorSession(rawToken: string | null) {
  if (!isVisitorSessionToken(rawToken)) return;
  const { error } = await createAdminClient().from("visitor_message_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("session_token_hash", hashVisitorSessionToken(rawToken))
    .is("revoked_at", null);
  if (error) throw new Error("visitor_session_revoke_failed");
}
