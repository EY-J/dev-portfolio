import type { Metadata } from "next";
import Link from "next/link";

import ForgetDeviceButton from "@/features/messaging/components/ForgetDeviceButton";
import RefreshMessagesButton from "@/features/messaging/components/RefreshMessagesButton";
import VisitorReplyForm from "@/features/messaging/components/VisitorReplyForm";
import RealtimeRefresh from "@/features/messaging/realtime/RealtimeRefresh";
import { readVisitorMessageSessionCookie } from "@/features/messaging/session/cookie";
import { getVisitorSessionConversations } from "@/features/messaging/session/service";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const fetchCache = "force-no-store";

const statusLabels = {
  new: "New inquiry",
  awaiting_admin: "Awaiting AJ's reply",
  awaiting_visitor: "Awaiting your reply",
  closed: "Closed",
} as const;

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const { conversation: requestedId } = await searchParams;
  const cookie = await readVisitorMessageSessionCookie();
  let loadFailed = false;
  let conversations: Awaited<ReturnType<typeof getVisitorSessionConversations>> = [];
  try {
    conversations = await getVisitorSessionConversations(cookie);
  } catch {
    loadFailed = true;
  }

  if (loadFailed) {
    return (
      <main className="mx-auto flex min-h-[65vh] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Messages are temporarily unavailable.</h1>
        <p className="mt-3 text-sm text-slate-600">Please try again in a moment.</p>
        <div className="mt-7"><RefreshMessagesButton /></div>
      </main>
    );
  }

  if (conversations.length === 0) {
    return (
      <main className="mx-auto flex min-h-[65vh] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Private portfolio conversations</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">Your private conversations</h1>
        <p className="mt-4 max-w-lg text-sm leading-7 text-slate-600">Your conversations will appear here after you start one or open a private email link.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950" href="/#message-me">Start a conversation</Link>
          <Link className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-medium text-slate-800 transition hover:border-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950" href="/messages/recover">Find my conversation</Link>
        </div>
      </main>
    );
  }

  const selected = requestedId
    ? conversations.find((conversation) => conversation.id === requestedId)
    : conversations[0];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-slate-200 pb-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Private project communication</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Messages</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Continue conversations you&apos;ve opened on this browser. Email access links should still be kept private.</p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <RefreshMessagesButton />
          <ForgetDeviceButton />
        </div>
      </div>

      <div className={conversations.length > 1 ? "grid gap-7 lg:grid-cols-[17rem_minmax(0,1fr)]" : "mx-auto max-w-3xl"}>
        {conversations.length > 1 ? (
          <nav aria-label="Your conversations" className="self-start rounded-2xl border border-slate-200 bg-white p-3">
            <h2 className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Conversations</h2>
            <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link aria-current={selected?.id === conversation.id ? "page" : undefined} className={`block rounded-xl px-3 py-3 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${selected?.id === conversation.id ? "bg-slate-950 text-white" : "text-slate-800 hover:bg-slate-100"}`} href={`/messages?conversation=${conversation.id}`}>
                    <span className="block truncate text-sm font-semibold">{conversation.subject}</span>
                    <span className={`mt-1 block text-xs ${selected?.id === conversation.id ? "text-slate-300" : "text-slate-500"}`}>{statusLabels[conversation.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {selected ? (
          <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <RealtimeRefresh conversationTopicId={selected.realtimeTopicId} />
            <header className="border-b border-slate-200 bg-slate-50 px-5 py-6 sm:px-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Private conversation</p>
              <h2 className="mt-2 break-words text-2xl font-semibold tracking-tight text-slate-950">{selected.subject}</h2>
              <p className="mt-3 inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700">{statusLabels[selected.status]}</p>
              <p className="mt-3 text-xs leading-5 text-slate-500">Available on this browser. Keep emailed access links private.</p>
            </header>
            <div className="px-5 py-6 sm:px-8">
              <ol aria-label="Conversation messages" className="space-y-7">
                {selected.messages.map((message) => (
                  <li className="border-b border-slate-100 pb-6 last:border-0 last:pb-0" key={message.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="text-sm font-semibold text-slate-950">{message.senderType === "admin" ? "AJ" : "You"}</span>
                      <time className="text-xs text-slate-500" dateTime={message.createdAt.toISOString()}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(message.createdAt)}</time>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{message.body}</p>
                  </li>
                ))}
              </ol>
              {selected.status === "closed" ? (
                <p className="mt-8 border-t border-slate-200 pt-6 text-sm text-slate-600">This conversation is closed and no longer accepts replies.</p>
              ) : (
                <VisitorReplyForm conversationId={selected.id} />
              )}
            </div>
          </article>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600">Conversation not found or no longer available on this browser.</section>
        )}
      </div>
    </main>
  );
}
