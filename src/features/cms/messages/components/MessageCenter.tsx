"use client";

import { Inbox, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import MessageDetail from "@/features/cms/messages/components/MessageDetail";
import MessageList from "@/features/cms/messages/components/MessageList";
import RealtimeRefresh from "@/features/messaging/realtime/RealtimeRefresh";
import { markAdminConversationRead } from "@/features/messaging/admin-actions";
import type { ConversationWithMessages } from "@/features/messaging/types";

export default function MessageCenter({ conversations }: { conversations: ConversationWithMessages[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const filteredConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return conversations;
    return conversations.filter((conversation) =>
      [conversation.visitorName, conversation.visitorEmail, conversation.subject,
        ...conversation.messages.map((message) => message.body)]
        .some((value) => value.toLowerCase().includes(normalizedQuery))
    );
  }, [conversations, query]);

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId
  ) ?? null;

  async function selectConversation(id: string) {
    setSelectedConversationId(id);
    const conversation = conversations.find((item) => item.id === id);
    if (conversation?.messages.some((message) => message.senderType === "visitor" && !message.readAt)) {
      if (await markAdminConversationRead(id)) router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <RealtimeRefresh adminInbox conversationTopicId={selectedConversation?.realtimeTopicId} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Messages</h1>
          <p className="mt-1 text-sm text-slate-600">Manage inquiries received from your portfolio.</p>
        </div>
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">Search conversations</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" type="search" value={query} />
        </label>
      </div>

      {conversations.length === 0 ? (
        <section className="flex min-h-[28rem] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-center">
          <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Inbox aria-hidden="true" className="size-5" /></span>
          <h2 className="font-semibold text-slate-950">No conversations yet</h2>
          <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">Inquiries from your portfolio contact form will appear here.</p>
        </section>
      ) : (
        <section className="grid min-h-[34rem] overflow-hidden rounded-xl border border-slate-200 bg-white lg:h-[clamp(34rem,68vh,46rem)] lg:grid-cols-[340px_minmax(0,1fr)]">
          <MessageList conversations={filteredConversations} onSelect={selectConversation} query={query} selectedConversationId={selectedConversationId} totalCount={conversations.length} />
          <MessageDetail conversation={selectedConversation} key={selectedConversation?.id ?? "empty"} />
        </section>
      )}
    </div>
  );
}
