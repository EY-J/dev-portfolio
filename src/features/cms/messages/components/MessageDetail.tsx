"use client";

import { MailOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import MessageReplyBox from "@/features/cms/messages/components/MessageReplyBox";
import { closeAdminConversation, deleteAdminConversation } from "@/features/messaging/admin-actions";
import type { ConversationStatus, ConversationWithMessages } from "@/features/messaging/types";

const statusStyles: Record<ConversationStatus, string> = {
  new: "bg-blue-50 text-blue-700 ring-blue-600/10",
  awaiting_admin: "bg-amber-50 text-amber-700 ring-amber-600/10",
  awaiting_visitor: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  closed: "bg-slate-100 text-slate-600 ring-slate-500/10",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function MessageDetail({ conversation }: { conversation: ConversationWithMessages | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!conversation) {
    return (
      <div className="flex min-h-[26rem] flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"><MailOpen aria-hidden="true" className="size-5" /></span>
        <h2 className="font-semibold text-slate-950">Select a conversation</h2>
        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">Choose an inquiry from the inbox to view its details.</p>
      </div>
    );
  }

  function handleClose() {
    if (!conversation) return;
    setError(null);
    startTransition(async () => {
      const closed = await closeAdminConversation(conversation.id);
      if (closed) router.refresh();
      else setError("Unable to close this conversation.");
    });
  }

  function handleDelete() {
    if (!conversation || conversation.status !== "closed") return;
    if (!window.confirm("This permanently deletes the conversation and its messages. This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      const deleted = await deleteAdminConversation(conversation.id);
      if (deleted) router.refresh();
      else setError("Unable to delete this conversation.");
    });
  }

  return (
    <article className="flex min-h-0 flex-col bg-white">
      <header className="border-b border-slate-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-slate-950">{conversation.visitorName}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${statusStyles[conversation.status]}`}>{conversation.status.replaceAll("_", " ")}</span>
            </div>
            <p className="mt-1 text-sm text-slate-700">{conversation.subject}</p>
            <p className="mt-1 truncate text-sm text-slate-500">{conversation.visitorEmail}</p>
            <time className="mt-1 block text-xs text-slate-400" dateTime={conversation.createdAt.toISOString()}>{formatDate(conversation.createdAt)}</time>
          </div>
          {conversation.status === "closed" ? (
            <Button disabled={pending} onClick={handleDelete} size="sm" type="button" variant="destructive">{pending ? "Deleting..." : "Delete permanently"}</Button>
          ) : (
            <Button disabled={pending} onClick={handleClose} size="sm" type="button" variant="outline">{pending ? "Closing..." : "Close conversation"}</Button>
          )}
        </div>
        {error ? <p className="mt-2 text-xs text-red-600" role="alert">{error}</p> : null}
      </header>
      <ol aria-label="Conversation thread" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-6">
        {conversation.messages.map((message) => (
          <li className="border-b border-slate-100 pb-5 last:border-b-0" key={message.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-950">{message.senderType === "admin" ? "You" : conversation.visitorName}</span>
              <time className="text-xs text-slate-500" dateTime={message.createdAt.toISOString()}>{formatDate(message.createdAt)}</time>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{message.body}</p>
          </li>
        ))}
      </ol>
      {conversation.status === "closed" ? (
        <p className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">This conversation is closed.</p>
      ) : (
        <MessageReplyBox key={conversation.id} conversationId={conversation.id} recipientName={conversation.visitorName} />
      )}
    </article>
  );
}
