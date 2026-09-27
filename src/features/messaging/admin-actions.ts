"use server";

import { revalidatePath } from "next/cache";

import { getAdminUser } from "@/features/cms/auth/service";
import { addAdminReply, closeConversation, deleteClosedConversation, getAdminConversation, markConversationRead } from "@/features/messaging/service";
import { notifyAdminReply } from "@/features/messaging/email/notifications";
import { validateReply } from "@/features/messaging/validation";

const INBOX_PATH = "/admin/messages";

export interface AdminReplyState {
  error: string | null;
  warning: string | null;
  version: number;
}

export async function submitAdminReply(conversationId: string, previousState: AdminReplyState, formData: FormData): Promise<AdminReplyState> {
  if (!(await getAdminUser())) return { ...previousState, error: "Access denied." };
  const body = validateReply(formData.get("body"));
  if (!body) return { ...previousState, error: "Write a reply of 1 to 5,000 characters." };

  let messageId: string;
  try {
    const savedId = await addAdminReply(conversationId, body);
    if (!savedId) return { ...previousState, error: "This conversation is unavailable or closed." };
    messageId = savedId;
  } catch {
    return { ...previousState, error: "Unable to send your reply right now." };
  }

  let notificationSent = false;
  try {
    const conversation = await getAdminConversation(conversationId);
    if (conversation) notificationSent = await notifyAdminReply(conversation, messageId);
  } catch {
    console.warn("Email notification lookup failed", { kind: "admin_reply", conversationId });
  }
  revalidatePath(INBOX_PATH);
  return {
    error: null,
    warning: notificationSent ? null : "Reply saved, but email notification could not be sent.",
    version: previousState.version + 1,
  };
}

export async function markAdminConversationRead(conversationId: string): Promise<boolean> {
  if (!(await getAdminUser())) return false;
  try {
    const updated = await markConversationRead(conversationId);
    if (updated) revalidatePath(INBOX_PATH);
    return updated;
  } catch {
    return false;
  }
}

export async function closeAdminConversation(conversationId: string): Promise<boolean> {
  if (!(await getAdminUser())) return false;
  try {
    const updated = await closeConversation(conversationId);
    if (updated) revalidatePath(INBOX_PATH);
    return updated;
  } catch {
    return false;
  }
}

export async function deleteAdminConversation(conversationId: string): Promise<boolean> {
  if (!(await getAdminUser())) return false;
  try {
    const deleted = await deleteClosedConversation(conversationId);
    if (deleted) revalidatePath(INBOX_PATH);
    return deleted;
  } catch {
    return false;
  }
}
