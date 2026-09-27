"use client";

import { useActionState } from "react";

import { forgetThisDevice } from "@/features/messaging/session/actions";

export default function ForgetDeviceButton() {
  const [state, action, pending] = useActionState(forgetThisDevice, { error: null });
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <button className="text-xs font-medium text-slate-500 underline underline-offset-4 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900" disabled={pending} type="submit">
        {pending ? "Forgetting..." : "Forget this device"}
      </button>
      {state.error ? <p aria-live="polite" className="text-xs text-red-700" role="alert">{state.error}</p> : null}
    </form>
  );
}
