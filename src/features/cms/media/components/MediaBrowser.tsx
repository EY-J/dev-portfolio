"use client";

import { Dialog } from "@base-ui/react/dialog";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useCmsToast } from "@/components/admin/CmsToastProvider";
import type { MediaAsset, MediaFilter, MediaFolder, MediaPage, MediaUsageFilter } from "@/features/cms/media/library-types";
import { uploadCmsMedia } from "@/features/cms/media/upload-client";
import MediaCropper from "@/features/cms/media/components/MediaCropper";

interface MediaBrowserProps {
  mode: "library" | "picker";
  onUse?: (asset: MediaAsset) => void;
}

const filters: { value: MediaFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "both", label: "Both" },
];

function formatSize(bytes: number | null) {
  if (bytes === null) return "Size unavailable";
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: string | null) {
  if (!date) return "Date unavailable";
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "Date unavailable" : parsed.toLocaleDateString();
}

export default function MediaBrowser({ mode, onUse }: MediaBrowserProps) {
  const notify = useCmsToast();
  const uploadInput = useRef<HTMLInputElement>(null);
  const openAfterUpload = useRef<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [folder, setFolder] = useState("");
  const [tag, setTag] = useState("");
  const [usage, setUsage] = useState<MediaUsageFilter>("all");
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState("");
  const [bulkTags, setBulkTags] = useState("");
  const [bulkFolder, setBulkFolder] = useState("");
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [detailsPath, setDetailsPath] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState({ displayName: "", altText: "", altTouched: false, folderKey: "general", tags: "" });
  const [saving, setSaving] = useState(false);
  const [cropPath, setCropPath] = useState<string | null>(null);

  function resetResults() {
    setLoading(true);
    setError(false);
    setItems([]);
    setCursor(null);
    setSelectedPath(null);
    setSelectedPaths([]);
  }

  function refreshResults() {
    resetResults();
    setReload((value) => value + 1);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText.trim() !== query) {
        resetResults();
        setQuery(searchText.trim());
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, searchText]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ query, filter, folder, tag, usage });
    void fetch(`/api/cms/media/library?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load media.");
        return await response.json() as MediaPage;
      })
      .then((page) => {
        setItems(page.items); setCursor(page.nextCursor); setFolders(page.folders);
        const uploaded = page.items.find((item) => item.path === openAfterUpload.current);
        if (uploaded) {
          openAfterUpload.current = null;
          setEditing({ displayName: uploaded.displayName, altText: uploaded.altText ?? "", altTouched: false, folderKey: uploaded.folderKey, tags: uploaded.tags.join(", ") });
          setDetailsPath(uploaded.path);
        }
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setError(true);
        notify("error", "Unable to load media.");
        console.error("[media] Unable to load library.", caught instanceof Error ? caught.name : "UnknownError");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, folder, tag, usage, notify, query, reload]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const params = new URLSearchParams({ query, filter, folder, tag, usage, cursor });
    try {
      const response = await fetch(`/api/cms/media/library?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load media.");
      const page = await response.json() as MediaPage;
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      notify("error", "Unable to load media.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const url = await uploadCmsMedia(file, folder || "general");
      openAfterUpload.current = url.replace("/api/cms/media/", "");
      notify("success", "Media uploaded. Add its details in the asset panel.");
      refreshResults();
      setSearchText(url.replace("/api/cms/media/", ""));
    } catch {
      notify("error", "Unable to upload image.");
    } finally {
      setUploading(false);
      if (uploadInput.current) uploadInput.current.value = "";
    }
  }

  async function remove(asset: MediaAsset) {
    if (!asset.canDelete) return;
    try {
      const response = await fetch("/api/cms/media/library", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: asset.path }),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || "Unable to delete image.");
      }
      setDetailsPath(null);
      notify("success", "Image deleted.");
      refreshResults();
    } catch (caught) {
      notify("error", caught instanceof Error ? caught.message : "Unable to delete image.");
    }
  }

  const selected = items.find((item) => item.path === selectedPath);
  const details = items.find((item) => item.path === detailsPath);

  async function patch(body: Record<string, unknown>) {
    const response = await fetch("/api/cms/media/library", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("Unable to update media.");
    return await response.json() as Record<string, unknown>;
  }

  async function saveDetails() {
    if (!details || saving) return;
    setSaving(true);
    try {
      await patch({ action: "details", path: details.path, displayName: editing.displayName,
        altText: editing.altTouched ? editing.altText : details.altText, folderKey: editing.folderKey,
        tags: editing.tags.split(",").map((value) => value.trim()).filter(Boolean) });
      notify("success", "Media details saved.");
      setDetailsPath(null);
      refreshResults();
    } catch { notify("error", "Unable to save media details."); }
    finally { setSaving(false); }
  }

  async function makeFolder() {
    if (!newFolder.trim()) return;
    try {
      await patch({ action: "folder", name: newFolder });
      notify("success", "Folder created.");
      setNewFolder("");
      refreshResults();
    } catch { notify("error", "Unable to create folder."); }
  }

  async function applyBulk(body: Record<string, unknown>, message: string) {
    try {
      const result = await patch({ action: "bulk", paths: selectedPaths, ...body });
      notify("success", `${result.count} ${message}`);
      setSelectedPaths([]);
      refreshResults();
    } catch { notify("error", "Unable to update selected media."); }
  }

  async function deleteBulk() {
    let deleted = 0;
    let skipped = 0;
    for (const path of selectedPaths) {
      try {
        const response = await fetch("/api/cms/media/library", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
        if (response.ok) deleted++; else skipped++;
      } catch { skipped++; }
    }
    notify(deleted ? "success" : "error", `${deleted} assets deleted. ${skipped} skipped because they are in use or protected.`);
    setConfirmBulkDelete(false);
    refreshResults();
  }

  return (
    <div className="min-w-0 space-y-5">
      {mode === "library" ? (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Media</h1>
            <p className="mt-1 text-sm text-slate-600">Manage images used across your portfolio.</p>
          </div>
          <div>
            <input accept="image/jpeg,image/png,image/webp" aria-label="Upload media file" className="sr-only" onChange={(event) => void upload(event.target.files?.[0])} ref={uploadInput} type="file" />
            <button className="inline-flex min-h-10 items-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50" disabled={uploading} onClick={() => uploadInput.current?.click()} type="button">{uploading ? "Uploading..." : "Upload media"}</button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="Search media" className="min-h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" onChange={(event) => setSearchText(event.target.value)} placeholder="Search media..." type="search" value={searchText} />
        <div aria-label="Media status" className="flex flex-wrap gap-1" role="group">
          {filters.map((option) => <button aria-pressed={filter === option.value} className={`min-h-10 rounded-md px-3 text-sm font-medium ${filter === option.value ? "bg-slate-950 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`} key={option.value} onClick={() => { if (filter !== option.value) { resetResults(); setFilter(option.value); } }} type="button">{option.label}</button>)}
        </div>
      </div>
      {mode === "library" ? <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <label className="min-w-40 flex-1 text-xs font-medium text-slate-600">Folder
          <select className="mt-1 block min-h-10 w-full rounded border border-slate-300 bg-white px-2 text-sm" onChange={(event) => { resetResults(); setFolder(event.target.value); }} value={folder}>
            <option value="">All Media</option>{folders.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
          </select>
        </label>
        <label className="min-w-36 flex-1 text-xs font-medium text-slate-600">Tag
          <input className="mt-1 min-h-10 w-full rounded border border-slate-300 px-2 text-sm" onChange={(event) => { resetResults(); setTag(event.target.value.toLowerCase()); }} placeholder="Filter by tag" value={tag} />
        </label>
        <label className="min-w-32 text-xs font-medium text-slate-600">Usage
          <select className="mt-1 block min-h-10 w-full rounded border border-slate-300 bg-white px-2 text-sm" onChange={(event) => { resetResults(); setUsage(event.target.value as MediaUsageFilter); }} value={usage}>
            <option value="all">All</option><option value="used">Used</option><option value="unused">Unused</option>
          </select>
        </label>
        <div className="flex min-w-48 flex-1 gap-2"><input aria-label="New folder name" className="min-h-10 min-w-0 flex-1 rounded border border-slate-300 px-2 text-sm" maxLength={80} onChange={(event) => setNewFolder(event.target.value)} placeholder="New folder" value={newFolder} /><button className="rounded border border-slate-300 px-3 text-sm" onClick={() => void makeFolder()} type="button">Add</button></div>
      </div> : null}
      {mode === "library" && selectedPaths.length ? <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm">
        <strong className="mr-2">{selectedPaths.length} selected</strong>
        <select aria-label="Move selected to folder" className="min-h-10 rounded border border-slate-300 bg-white px-2" onChange={(event) => setBulkFolder(event.target.value)} value={bulkFolder}><option value="">Choose folder</option>{folders.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select>
        <button className="min-h-10 rounded border border-slate-300 bg-white px-3 disabled:opacity-50" disabled={!bulkFolder} onClick={() => void applyBulk({ folderKey: bulkFolder }, "assets moved.")} type="button">Move</button>
        <input aria-label="Tags for selected media" className="min-h-10 min-w-0 rounded border border-slate-300 px-2" onChange={(event) => setBulkTags(event.target.value)} placeholder="Tags, comma separated" value={bulkTags} />
        <button className="min-h-10 rounded border border-slate-300 bg-white px-3" disabled={!bulkTags.trim()} onClick={() => void applyBulk({ addTags: bulkTags }, "assets tagged.")} type="button">Add tags</button>
        <button className="min-h-10 rounded border border-slate-300 bg-white px-3" disabled={!bulkTags.trim()} onClick={() => void applyBulk({ removeTags: bulkTags }, "assets updated.")} type="button">Remove tags</button>
        {confirmBulkDelete ? <button className="min-h-10 rounded border border-red-400 bg-red-50 px-3 text-red-800" onClick={() => void deleteBulk()} type="button">Confirm delete {selectedPaths.length}</button> : <button className="min-h-10 rounded border border-red-300 bg-white px-3 text-red-700" onClick={() => setConfirmBulkDelete(true)} type="button">Delete unused</button>}
        <button className="min-h-10 px-2 underline" onClick={() => setSelectedPaths([])} type="button">Clear selection</button>
      </div> : null}

      {loading ? <div aria-label="Loading media" className="grid grid-cols-1 gap-4 min-[430px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div className="h-44 animate-pulse rounded-lg border border-slate-200 bg-slate-100" key={index} />)}</div> : null}
      {!loading && error ? <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">Unable to load media. <button className="font-medium text-slate-950 underline" onClick={refreshResults} type="button">Try again</button></div> : null}
      {!loading && !error && items.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-12 text-center">
          <p className="font-medium text-slate-900">{query || filter !== "all" ? "No matching media." : "No media yet."}</p>
          <p className="mt-2 text-sm text-slate-600">{query || filter !== "all" ? "Try another search or filter." : "Upload your first image to start building your media library."}</p>
          {mode === "library" && !query && filter === "all" ? <button className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium" onClick={() => uploadInput.current?.click()} type="button">Upload media</button> : null}
        </div>
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 min-[430px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" data-media-grid>
          {items.map((asset, index) => (
            <div className="relative min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" key={asset.path}>
              {mode === "library" ? <label className="absolute left-2 top-2 z-10 flex size-9 items-center justify-center rounded bg-white/95 shadow"><input aria-label={`Select ${asset.displayName}`} checked={selectedPaths.includes(asset.path)} className="size-4" onChange={(event) => setSelectedPaths((current) => event.target.checked ? [...current, asset.path] : current.filter((path) => path !== asset.path))} type="checkbox" /></label> : null}
              <button aria-pressed={mode === "picker" ? selectedPath === asset.path : undefined} className={`block w-full min-w-0 text-left transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 ${selectedPath === asset.path && mode === "picker" ? "ring-2 ring-inset ring-slate-950" : ""}`} data-media-option={mode === "picker" ? "" : undefined} onKeyDown={(event) => { if (mode !== "picker" || !["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(event.key)) return; event.preventDefault(); const buttons = [...event.currentTarget.closest("[data-media-grid]")!.querySelectorAll<HTMLButtonElement>("[data-media-option]")]; buttons[Math.min(Math.max(index + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1), 0), buttons.length - 1)]?.focus(); }} onClick={() => { if (mode === "picker") setSelectedPath(asset.path); else { setDetailsPath(asset.path); setDimensions(null); setConfirmDelete(false); setEditing({ displayName: asset.displayName, altText: asset.altText ?? "", altTouched: false, folderKey: asset.folderKey, tags: asset.tags.join(", ") }); } }} type="button">
                <span className="relative block aspect-[4/3] bg-slate-100"><Image alt="" className="object-contain" fill sizes="(max-width: 430px) 100vw, (max-width: 768px) 50vw, 25vw" src={asset.url} unoptimized /></span>
                <span className="block min-w-0 space-y-1 p-3"><span className="block truncate text-sm font-medium text-slate-950">{asset.displayName}</span>{mode === "picker" ? <span className="block truncate text-xs text-slate-400">{asset.path}</span> : null}<span className="block truncate text-xs text-slate-500">{asset.folderName} · {asset.status}</span><span className="block text-xs text-slate-500">{asset.usages.length ? `Used in ${asset.usages.length} ${asset.usages.length === 1 ? "place" : "places"}` : "Unused"}</span></span>
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {!loading && cursor ? <button className="min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50" disabled={loadingMore} onClick={() => void loadMore()} type="button">{loadingMore ? "Loading..." : "Load more"}</button> : null}
      {mode === "picker" ? <div className="sticky bottom-0 flex justify-end border-t border-slate-200 bg-white py-3"><button className="min-h-10 rounded-md bg-slate-950 px-4 text-sm font-medium text-white disabled:bg-slate-300" disabled={!selected} onClick={() => selected && onUse?.(selected)} type="button">Use selected image</button></div> : null}

      {mode === "library" ? <Dialog.Root onOpenChange={(open) => { if (!open) { setDetailsPath(null); setConfirmDelete(false); } }} open={Boolean(details)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[1100] bg-slate-950/50" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-[1101] max-h-[min(90vh,800px)] w-[min(38rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-5 shadow-xl sm:p-6">
            <Dialog.Title className="text-lg font-semibold text-slate-950">Media details</Dialog.Title>
            <Dialog.Description className="mt-1 break-all text-sm text-slate-600">{details?.path}</Dialog.Description>
            {details ? <div className="mt-5 space-y-5">
              <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-slate-100"><Image alt="" className="object-contain" fill onLoad={(event) => setDimensions(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`)} sizes="(max-width: 640px) 100vw, 600px" src={details.url} unoptimized /></div>
              <div className="grid gap-3">
                <label className="text-sm font-medium text-slate-700">Display name<input className="mt-1 block min-h-10 w-full rounded border border-slate-300 px-3 font-normal" maxLength={160} onChange={(event) => setEditing((current) => ({ ...current, displayName: event.target.value }))} value={editing.displayName} /></label>
                <label className="text-sm font-medium text-slate-700">Default alt text<input className="mt-1 block min-h-10 w-full rounded border border-slate-300 px-3 font-normal" maxLength={500} onChange={(event) => setEditing((current) => ({ ...current, altText: event.target.value, altTouched: true }))} placeholder="Leave empty to keep contextual alt text" value={editing.altText} /></label>
                <button className="justify-self-start text-xs text-slate-600 underline" onClick={() => setEditing((current) => ({ ...current, altText: "", altTouched: true }))} type="button">Mark image decorative (empty alt text)</button>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">Folder<select className="mt-1 block min-h-10 w-full rounded border border-slate-300 bg-white px-2 font-normal" onChange={(event) => setEditing((current) => ({ ...current, folderKey: event.target.value }))} value={editing.folderKey}>{folders.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
                  <label className="text-sm font-medium text-slate-700">Tags<input className="mt-1 block min-h-10 w-full rounded border border-slate-300 px-3 font-normal" onChange={(event) => setEditing((current) => ({ ...current, tags: event.target.value }))} placeholder="hero, portrait" value={editing.tags} /></label>
                </div>
                <button className="min-h-10 justify-self-start rounded bg-slate-950 px-4 text-sm font-medium text-white disabled:opacity-50" disabled={saving} onClick={() => void saveDetails()} type="button">{saving ? "Saving..." : "Save details"}</button>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="font-medium text-slate-500">Type</dt><dd>WebP</dd></div>
                <div><dt className="font-medium text-slate-500">Dimensions</dt><dd>{details.width && details.height ? `${details.width} × ${details.height}` : dimensions ?? "Unavailable"}</dd></div>
                <div><dt className="font-medium text-slate-500">Storage state</dt><dd>{details.status}</dd></div>
                <div><dt className="font-medium text-slate-500">Size</dt><dd>{formatSize(details.size)}</dd></div>
                <div><dt className="font-medium text-slate-500">Uploaded</dt><dd>{formatDate(details.createdAt)}</dd></div>
              </dl>
              <div><p className="text-sm font-medium text-slate-950">Used by</p>{details.usages.length ? <div className="mt-2 space-y-3 text-sm text-slate-600">{(["Draft", "Published"] as const).map((scope) => { const group = details.usages.filter((item) => item.scope === scope); return group.length ? <div key={scope}><p className="font-medium text-slate-800">{scope}</p><ul className="ml-4 list-disc">{group.map((item, index) => <li key={`${item.label}-${index}`}>{item.label}</li>)}</ul></div> : null; })}</div> : <p className="mt-1 text-sm text-slate-600">Unused</p>}</div>
              {details.parentPath ? <p className="text-sm text-slate-600">Derived from: {items.find((item) => item.path === details.parentPath)?.displayName ?? details.parentPath}</p> : null}
              <div>
                <p className="text-sm font-medium text-slate-950">Use media</p>
                <p className="mt-1 text-xs text-slate-500">Choose an editor. The image will be selected there; save the form to update the draft.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[["Profile", "/admin/profile"], ["New project", "/admin/projects"]].map(([label, href]) => <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50" href={`${href}?media=${encodeURIComponent(details.url)}`} key={href}>{label}</Link>)}
                </div>
              </div>
              {details.hasPublished ? <p className="text-xs text-slate-500">Published assets are kept to protect earlier site revisions.</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <p className="text-xs text-slate-500">Existing Project and Blog entries can also choose this image from their editors.</p>
                <div className="flex gap-2">
                  {!details.parentPath ? <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" onClick={() => { setCropPath(details.path); setDetailsPath(null); }} type="button">Crop</button> : null}
                  {details.canDelete ? confirmDelete ? <button className="rounded-md border border-red-400 bg-red-50 px-3 py-2 text-sm font-medium text-red-800" onClick={() => void remove(details)} type="button">Confirm delete</button> : <button className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50" onClick={() => setConfirmDelete(true)} type="button">Delete unused image</button> : null}
                  <Dialog.Close className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium" type="button">Close</Dialog.Close>
                </div>
              </div>
            </div> : null}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root> : null}
      {mode === "library" && cropPath ? <MediaCropper asset={items.find((item) => item.path === cropPath) ?? null} onClose={() => setCropPath(null)} onCreated={() => { setCropPath(null); refreshResults(); notify("success", "Crop created."); }} /> : null}
    </div>
  );
}
