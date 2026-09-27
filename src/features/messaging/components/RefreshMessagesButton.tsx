"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function RefreshMessagesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-500 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900" disabled={pending} onClick={() => startTransition(() => router.refresh())} type="button">
      {pending ? "Refreshing..." : "Refresh messages"}
    </button>
  );
}
