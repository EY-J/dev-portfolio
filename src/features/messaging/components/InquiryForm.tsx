"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { submitInquiry } from "@/features/messaging/actions";

const initialState = { error: null };
const inputClass = "mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100";

export default function InquiryForm() {
  const [state, formAction, pending] = useActionState(submitInquiry, initialState);

  return (
    <form action={formAction} className="mt-7 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Name
          <input autoComplete="name" className={inputClass} maxLength={120} name="name" required type="text" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input autoComplete="email" className={inputClass} maxLength={254} name="email" required type="email" />
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Subject
        <input className={inputClass} maxLength={200} name="subject" required type="text" />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Message
        <textarea className="mt-1.5 min-h-40 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100" maxLength={5000} name="message" required />
      </label>
      {state.error ? <p aria-live="polite" className="text-sm text-red-700" role="alert">{state.error}</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-sm text-xs leading-5 text-slate-500">Your conversation opens here after sending. Keep your email link private so you can return from another browser.</p>
        <Button disabled={pending} type="submit">{pending ? "Starting..." : "Start conversation"}</Button>
      </div>
    </form>
  );
}
