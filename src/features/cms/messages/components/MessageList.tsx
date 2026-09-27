import { Inbox } from "lucide-react";

import type { ConversationWithMessages } from "@/features/messaging/types";

interface MessageListProps {
  conversations: ConversationWithMessages[];
  onSelect: (conversationId: string) => void;
  query: string;
  selectedConversationId: string | null;
  totalCount: number;
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function formatTimestamp(date: Date) {
  const isToday = new Date().toDateString() === date.toDateString();
  return new Intl.DateTimeFormat("en-US", isToday
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" }).format(date);
}

export default function MessageList({ conversations, onSelect, query, selectedConversationId, totalCount }: MessageListProps) {
  return (
    <aside className="flex max-h-[28rem] min-h-0 flex-col border-b border-slate-200 lg:max-h-none lg:border-b-0 lg:border-r">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5">
        <div className="flex items-center gap-2.5"><Inbox aria-hidden="true" className="size-4 text-slate-500" /><h2 className="font-semibold text-slate-950">Inbox</h2></div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{totalCount}</span>
      </div>
      {conversations.length === 0 ? (
        <div className="flex min-h-52 flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-sm font-medium text-slate-700">No matching conversations</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">No inquiries match “{query.trim()}”.</p>
        </div>
      ) : (
        <div className="min-h-0 overflow-y-auto">
          {conversations.map((conversation) => {
            const selected = conversation.id === selectedConversationId;
            const unread = conversation.messages.some((message) => message.senderType === "visitor" && !message.readAt);
            const latest = conversation.messages.at(-1);
            return (
              <button aria-pressed={selected} className={`relative flex w-full gap-3 border-b border-slate-100 px-4 py-4 text-left transition-colors last:border-b-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 ${selected ? "bg-slate-100" : "bg-white hover:bg-slate-50"}`} key={conversation.id} onClick={() => onSelect(conversation.id)} type="button">
                {selected ? <span className="absolute inset-y-0 left-0 w-0.5 bg-slate-900" /> : null}
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">{getInitials(conversation.visitorName)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {unread ? <span aria-label="Unread" className="size-2 shrink-0 rounded-full bg-blue-600" title="Unread" /> : null}
                    <span className={`min-w-0 flex-1 truncate text-sm text-slate-950 ${unread ? "font-semibold" : "font-medium"}`}>{conversation.visitorName}</span>
                    <time className="shrink-0 text-xs text-slate-500" dateTime={conversation.lastMessageAt.toISOString()}>{formatTimestamp(conversation.lastMessageAt)}</time>
                  </span>
                  <span className="mt-1 block truncate text-sm font-medium text-slate-700">{conversation.subject}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{latest?.body ?? "No messages"}</span>
                  <span className="mt-1 inline-block text-[11px] capitalize text-slate-400">{conversation.status.replaceAll("_", " ")}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
