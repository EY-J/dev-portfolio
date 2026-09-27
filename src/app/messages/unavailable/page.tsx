import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Conversation unavailable",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ConversationUnavailablePage() {
  return (
    <main className="mx-auto flex min-h-[65vh] max-w-3xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Messages</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">Conversation not found or no longer available.</h1>
      <p className="mt-4 max-w-lg text-sm leading-7 text-slate-600">If you need access again, request a new private link using the email address from your conversation.</p>
      <Link className="mt-7 inline-flex rounded-lg bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950" href="/messages/recover">Find my conversation</Link>
    </main>
  );
}
