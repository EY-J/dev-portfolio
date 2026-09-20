import "server-only";

import type { MessageRow } from "@/features/cms/messages/types";
import { createClient } from "@/lib/supabase/server";
import type { Message, MessageStatus } from "@/types/message";

const MESSAGE_COLUMNS = "id, name, email, message, status, created_at";

function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    message: row.message,
    status: row.status,
    createdAt: new Date(row.created_at),
  };
}

export async function getMessages(): Promise<Message[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Failed to load messages.");
  }

  return ((data ?? []) as MessageRow[]).map(mapMessage);
}

export async function updateMessageStatus(
  id: string,
  status: MessageStatus
): Promise<Message> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .update({ status })
    .eq("id", id)
    .select(MESSAGE_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error("Failed to update message status.");
  }

  return mapMessage(data as MessageRow);
}
