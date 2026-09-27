"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { submitConversationRecovery } from "@/features/messaging/recovery/actions";

export default function RecoveryForm() {
  const [state, formAction, pending] = useActionState(submitConversationRecovery, { submitted: false });

  if (state.submitted) {
    return (
      <section aria-live="polite" className="mt-7 rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
        <h2 className="text-xl font-semibold text-slate-950">Check your email</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">If a conversation exists for this email address, we&apos;ve sent a private access link.</p>
      </section>
    );
  }

  return (
    <form action={formAction} className="mt-7 space-y-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
      <label className="block text-sm font-medium text-slate-700" htmlFor="recovery-email">
        Email address
        <input autoComplete="email" className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100" id="recovery-email" maxLength={254} name="email" required type="email" />
      </label>
      <Button disabled={pending} type="submit">{pending ? "Sending..." : "Send private access link"}</Button>
    </form>
  );
}
