"use client";

import { Dialog } from "@base-ui/react/dialog";
import Image from "next/image";
import { useRef, useState } from "react";

import { useCmsToast } from "@/components/admin/CmsToastProvider";
import type { MediaAsset } from "@/features/cms/media/library-types";

type Rect = { x: number; y: number; width: number; height: number };
const presets = ["Freeform", "1:1", "4:5", "3:2", "4:3", "16:9"] as const;

function centeredCrop(ratio: number, imageRatio: number): Rect {
  const width = Math.min(1, ratio / imageRatio);
  const height = Math.min(1, imageRatio / ratio);
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}

export default function MediaCropper({ asset, onClose, onCreated }: { asset: MediaAsset | null; onClose: () => void; onCreated: () => void }) {
  const notify = useCmsToast();
  const image = useRef<HTMLImageElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: asset?.width ?? 1, height: asset?.height ?? 1 });
  const [preset, setPreset] = useState<(typeof presets)[number]>("Freeform");
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, width: 1, height: 1 });
  const [saving, setSaving] = useState(false);
  if (!asset) return null;

  function point(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = image.current?.getBoundingClientRect();
    if (!bounds) return null;
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  }

  function choosePreset(value: (typeof presets)[number]) {
    setPreset(value);
    if (value === "Freeform") { setRect({ x: 0, y: 0, width: 1, height: 1 }); return; }
    const [a, b] = value.split(":").map(Number);
    setRect(centeredCrop(a / b, size.width / size.height));
  }

  async function create() {
    if (!asset || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/cms/media/crop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: asset.path, rect }) });
      if (!response.ok) throw new Error("Crop failed.");
      onCreated();
    } catch { notify("error", "Unable to create crop."); }
    finally { setSaving(false); }
  }

  return <Dialog.Root onOpenChange={(open) => { if (!open) onClose(); }} open>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-[1110] bg-slate-950/60" />
      <Dialog.Popup className="fixed left-1/2 top-1/2 z-[1111] flex max-h-[92vh] w-[min(52rem,calc(100vw-1rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="border-b border-slate-200 p-4"><Dialog.Title className="text-lg font-semibold">Create a crop</Dialog.Title><Dialog.Description className="text-sm text-slate-600">Drag on the image to select an area. The original stays intact.</Dialog.Description></div>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Crop aspect ratio">{presets.map((value) => <button aria-pressed={preset === value} className={`rounded border px-3 py-2 text-sm ${preset === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`} key={value} onClick={() => choosePreset(value)} type="button">{value}</button>)}</div>
          <div className="flex justify-center overflow-hidden rounded bg-slate-100 p-2">
            <div className="relative inline-block max-w-full touch-none select-none" onPointerDown={(event) => { const position = point(event); if (!position) return; event.currentTarget.setPointerCapture(event.pointerId); start.current = position; setPreset("Freeform"); setRect({ ...position, width: 0, height: 0 }); }} onPointerMove={(event) => { if (!start.current) return; const end = point(event); if (!end) return; setRect({ x: Math.min(start.current.x, end.x), y: Math.min(start.current.y, end.y), width: Math.abs(end.x - start.current.x), height: Math.abs(end.y - start.current.y) }); }} onPointerUp={() => { start.current = null; }}>
              <Image alt="" className="block max-h-[50vh] max-w-full object-contain" height={size.height} onLoad={(event) => { setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); }} ref={image} src={asset.url} unoptimized width={size.width} />
              <div aria-hidden="true" className="pointer-events-none absolute border-2 border-white bg-white/15 shadow-[0_0_0_9999px_rgba(15,23,42,.45)]" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />
            </div>
          </div>
          <p className="text-sm text-slate-600">Approximate output: {Math.ceil(rect.width * size.width)} × {Math.ceil(rect.height * size.height)} px. No upscaling.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4"><Dialog.Close className="rounded border border-slate-300 px-4 py-2 text-sm" type="button">Cancel</Dialog.Close><button className="rounded bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={saving || rect.width < 0.01 || rect.height < 0.01} onClick={() => void create()} type="button">{saving ? "Creating..." : "Create new asset"}</button></div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
