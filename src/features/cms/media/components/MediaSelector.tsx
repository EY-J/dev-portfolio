"use client";

import { Dialog } from "@base-ui/react/dialog";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import { useCmsToast } from "@/components/admin/CmsToastProvider";
import MediaBrowser from "@/features/cms/media/components/MediaBrowser";
import type { MediaAsset } from "@/features/cms/media/library-types";

export default function MediaSelector({ disabled, id, label, onChange, value }: {
  disabled: boolean; id: string; label: string; onChange: (url: string) => void; value: string;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<MediaAsset | null>(null);
  const notify = useCmsToast();
  const path = value.replace(/^\/api\/(cms\/)?media\//, "");
  const [savedName, setSavedName] = useState<string | null>(null);
  useEffect(() => {
    if (!value.startsWith("/api/")) return;
    const controller = new AbortController();
    void fetch(`/api/cms/media/details?path=${encodeURIComponent(path)}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ asset?: { displayName?: string } }> : null)
      .then((result) => { if (!controller.signal.aborted) setSavedName(result?.asset?.displayName ?? null); })
      .catch(() => {});
    return () => controller.abort();
  }, [path, value]);
  return <Dialog.Root onOpenChange={setOpen} open={open}>
    <Dialog.Trigger aria-labelledby={`${id}-label`} className="flex min-h-16 w-full min-w-0 items-center gap-3 rounded-md border border-slate-300 bg-white p-2 text-left hover:border-slate-500 disabled:opacity-50" disabled={disabled} id={id}>
      {value ? <span className="relative block size-12 shrink-0 overflow-hidden rounded bg-slate-100"><Image alt="" className="object-contain" fill sizes="48px" src={value} unoptimized /></span> : <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500">+</span>}
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{value ? chosen?.url === value ? chosen.displayName : savedName ?? "Selected image" : `Choose ${label.toLowerCase()}`}</span><span className="block truncate text-xs text-slate-500">{value ? path : "Select from Media"}</span></span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-slate-500" />
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-[1100] bg-slate-950/50" />
      <Dialog.Popup className="fixed left-1/2 top-1/2 z-[1101] flex max-h-[min(92vh,900px)] w-[min(64rem,calc(100vw-1rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
          <div><Dialog.Title className="text-lg font-semibold">Choose from Media</Dialog.Title><Dialog.Description className="mt-1 text-sm text-slate-600">Search and select an existing image for this draft.</Dialog.Description></div>
          <Dialog.Close aria-label="Close media selector" className="rounded-md border border-slate-300 px-3 py-2 text-sm" type="button">Close</Dialog.Close>
        </div>
        <div className="min-h-0 overflow-y-auto p-4 sm:p-5"><MediaBrowser mode="picker" onUse={(asset) => { setChosen(asset); onChange(asset.url); setOpen(false); notify("success", "Image selected. Save to update the draft."); }} /></div>
        <div className="border-t border-slate-200 bg-white p-3 text-right"><Link className="text-sm font-medium text-slate-700 underline" href="/admin/media" rel="noopener noreferrer" target="_blank">Manage Media →</Link></div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
