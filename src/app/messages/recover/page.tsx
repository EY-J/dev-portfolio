import type { Metadata } from "next";
import Link from "next/link";

import RecoveryForm from "@/features/messaging/recovery/RecoveryForm";

export const metadata: Metadata = {
  title: "Find your conversation",
  robots: { index: false, follow: false },
};

export default function RecoverConversationPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Find your conversation</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Enter the email address you used when contacting me.</p>
      <RecoveryForm />
      <Link className="mt-6 inline-block text-sm font-medium text-slate-700 underline underline-offset-4 hover:text-slate-950" href="/messages">Back to messages</Link>
    </main>
  );
}
