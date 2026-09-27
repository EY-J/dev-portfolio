"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { submitAdminReply } from "@/features/messaging/admin-actions";

interface MessageReplyBoxProps {
  conversationId: string;
  recipientName: string;
}

export default function MessageReplyBox({ conversationId, recipientName }: MessageReplyBoxProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    submitAdminReply.bind(null, conversationId),
    { error: null, warning: null, version: 0 }
  );

  useEffect(() => {
    if (state.version > 0) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [router, state.version]);

  return (
    <form action={formAction} className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-5" ref={formRef}>
      <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="message-reply">Reply to {recipientName}</label>
      <textarea className="min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" id="message-reply" maxLength={5000} name="body" placeholder="Write a reply..." required />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {state.error ? <p aria-live="polite" className="text-xs text-red-600" role="alert">{state.error}</p> : state.warning ? <p aria-live="polite" className="text-xs text-amber-700" role="status">{state.warning}</p> : <p className="text-xs text-slate-500">Your reply will appear on the visitor’s private conversation page.</p>}
        <Button disabled={pending} type="submit"><Send aria-hidden="true" data-icon="inline-start" />{pending ? "Sending..." : "Send Reply"}</Button>
      </div>
    </form>
  );
}
