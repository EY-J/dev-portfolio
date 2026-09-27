"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { submitSessionVisitorReply } from "@/features/messaging/session/actions";

export default function VisitorReplyForm({ conversationId }: { conversationId: string }) {
  const [state, formAction, pending] = useActionState(
    submitSessionVisitorReply.bind(null, conversationId),
    { error: null }
  );

  return (
    <form action={formAction} className="mt-8 space-y-3 border-t border-slate-200 pt-6">
      <label className="block text-sm font-medium text-slate-700" htmlFor="visitor-reply">Your reply</label>
      <textarea className="min-h-28 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100" id="visitor-reply" maxLength={5000} name="body" placeholder="Write your reply..." required />
      {state.error ? <p aria-live="polite" className="text-sm text-red-700" role="alert">{state.error}</p> : null}
      <Button disabled={pending} type="submit">{pending ? "Sending..." : "Send reply"}</Button>
    </form>
  );
}
