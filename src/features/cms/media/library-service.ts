import "server-only";

import type { FileObject } from "@supabase/storage-js";

import { createAuthorizedCmsClient } from "@/features/cms/auth/service";
import { draftMediaPath, DRAFT_MEDIA_BUCKET, isMediaPath, publicMediaPath, publicMediaUrl, draftMediaUrl, PUBLIC_MEDIA_BUCKET, type MediaCategory } from "@/features/cms/media/paths";
import type { MediaAsset, MediaFilter, MediaPage, MediaUsage } from "@/features/cms/media/library-types";
import type { MediaSearchOptions } from "@/features/cms/media/library-types";
import { fallbackMetadata, readMediaMetadata } from "@/features/cms/media/metadata";
import { createAdminClient } from "@/lib/supabase/admin";

const CATEGORIES: MediaCategory[] = ["profile", "projects", "blog", "media"];
const BUCKETS = [DRAFT_MEDIA_BUCKET, PUBLIC_MEDIA_BUCKET] as const;
const PAGE_SIZE = 24;
const MAX_SCANNED_PER_PAGE = 500;
type Bucket = typeof BUCKETS[number];
type AdminStorage = ReturnType<typeof createAdminClient>["storage"];
type CmsClient = Awaited<ReturnType<typeof createAuthorizedCmsClient>>;

interface Stream {
  bucket: Bucket;
  category: MediaCategory;
  offset: number;
  entries: FileObject[];
  index: number;
  exhausted: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mediaPath(value: unknown): string | null {
  const url = string(value);
  return draftMediaPath(url) ?? publicMediaPath(url);
}

async function readRows(client: CmsClient, table: "profiles" | "projects" | "blog_posts", columns: string) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from(table).select(columns).range(offset, offset + 499);
    if (error) throw new Error("Unable to check media usage.");
    rows.push(...(data ?? []) as unknown as Record<string, unknown>[]);
    if (!data || data.length < 500) break;
  }
  return rows;
}

export async function getMediaUsage(client: CmsClient): Promise<Map<string, MediaUsage[]>> {
  const [profiles, projects, blogPosts, published] = await Promise.all([
    readRows(client, "profiles", "name, avatar_url"),
    readRows(client, "projects", "title, image_url"),
    readRows(client, "blog_posts", "title, image_url"),
    client.rpc("get_published_site"),
  ]);
  if (published.error || !record(published.data)) throw new Error("Unable to check media usage.");
  const usages = new Map<string, MediaUsage[]>();
  function add(value: unknown, scope: MediaUsage["scope"], label: string) {
    const path = mediaPath(value);
    if (!path) return;
    const current = usages.get(path) ?? [];
    current.push({ scope, label });
    usages.set(path, current);
  }
  for (const profile of profiles) add(profile.avatar_url, "Draft", "Profile → Hero image");
  for (const project of projects) add(project.image_url, "Draft", `Project → ${string(project.title) ?? "Untitled"}`);
  for (const post of blogPosts) add(post.image_url, "Draft", `Blog → ${string(post.title) ?? "Untitled"}`);

  const snapshot = record(published.data)!;
  add(record(snapshot.profile)?.avatarUrl, "Published", "Profile → Hero image");
  for (const value of Array.isArray(snapshot.projects) ? snapshot.projects : []) {
    const project = record(value);
    add(project?.imageUrl, "Published", `Project → ${string(project?.title) ?? "Untitled"}`);
  }
  for (const value of Array.isArray(snapshot.blogPosts) ? snapshot.blogPosts : []) {
    const post = record(value);
    add(post?.imageUrl, "Published", `Blog → ${string(post?.title) ?? "Untitled"}`);
  }
  return usages;
}

async function objectExists(storage: AdminStorage, bucket: Bucket, path: string): Promise<boolean> {
  // The installed Storage SDK returns data:false with an error for 400/404 HEAD misses.
  const result = await storage.from(bucket).exists(path);
  if (result.data === true) return true;
  if (result.data === false) return false;
  throw new Error("Unable to check media storage.");
}

function cursorOffsets(cursor: string | null, query: string, filter: MediaFilter, options: MediaSearchOptions): number[] {
  if (!cursor) return Array(8).fill(0) as number[];
  if (cursor.length > 1024) throw new Error("Invalid media cursor.");
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    const parsed = record(value);
    if (parsed?.query !== query || parsed.filter !== filter || parsed.folder !== (options.folder ?? "") ||
      parsed.tag !== (options.tag ?? "") || parsed.usage !== (options.usage ?? "all") || !Array.isArray(parsed.offsets) ||
      parsed.offsets.length !== 8 || !parsed.offsets.every((offset) => Number.isSafeInteger(offset) && offset >= 0 && offset <= 100000)) {
      throw new Error("Invalid media cursor.");
    }
    return parsed.offsets as number[];
  } catch {
    throw new Error("Invalid media cursor.");
  }
}

export async function listManagedMedia(queryInput: string, filter: MediaFilter, cursor: string | null, options: MediaSearchOptions = {}): Promise<MediaPage> {
  const client = await createAuthorizedCmsClient();
  const query = queryInput.trim().toLowerCase().slice(0, 100);
  const offsets = cursorOffsets(cursor, query, filter, options);
  const { assets: metadata, folders } = await readMediaMetadata();
  const folderNames = new Map(folders.map((folder) => [folder.key, folder.name]));
  const usages = await getMediaUsage(client);
  const categories = CATEGORIES;
  const storage = createAdminClient().storage;
  const streams: Stream[] = BUCKETS.flatMap((bucket, bucketIndex) => CATEGORIES.map((category, categoryIndex) => ({
    bucket, category, offset: offsets[bucketIndex * CATEGORIES.length + categoryIndex], entries: [], index: 0,
    exhausted: !categories.includes(category),
  })));

  async function head(stream: Stream): Promise<FileObject | null> {
    while (stream.index >= stream.entries.length && !stream.exhausted) {
      const { data, error } = await storage.from(stream.bucket).list(stream.category, {
        limit: PAGE_SIZE,
        offset: stream.offset,
        sortBy: { column: "created_at", order: "desc" },
      });
      if (error || !data) throw new Error("Unable to load media.");
      stream.entries = data;
      stream.index = 0;
      stream.exhausted = data.length < PAGE_SIZE;
    }
    return stream.entries[stream.index] ?? null;
  }

  const items: MediaAsset[] = [];
  let scanned = 0;
  while (items.length < PAGE_SIZE && scanned < MAX_SCANNED_PER_PAGE) {
    const heads = await Promise.all(streams.map(head));
    let chosen = -1;
    for (let i = 0; i < heads.length; i++) {
      if (!heads[i]) continue;
      if (chosen < 0 || (heads[i]!.created_at ?? "") > (heads[chosen]!.created_at ?? "")) chosen = i;
    }
    if (chosen < 0) break;
    const stream = streams[chosen];
    const entry = heads[chosen]!;
    stream.index++;
    stream.offset++;
    scanned++;
    const path = `${stream.category}/${entry.name}`;
    if (!entry.id || !isMediaPath(path)) continue;

    const hasDraft = stream.bucket === DRAFT_MEDIA_BUCKET || await objectExists(storage, DRAFT_MEDIA_BUCKET, path);
    if (stream.bucket === PUBLIC_MEDIA_BUCKET && hasDraft) continue;
    const hasPublished = stream.bucket === PUBLIC_MEDIA_BUCKET || await objectExists(storage, PUBLIC_MEDIA_BUCKET, path);
    if (filter === "draft" && !hasDraft || filter === "published" && !hasPublished || filter === "both" && !(hasDraft && hasPublished)) continue;
    const assetUsages = usages.get(path) ?? [];
    const info = metadata.get(path) ?? fallbackMetadata(path, assetUsages[0]?.label);
    const folderName = folderNames.get(info.folderKey) ?? "General";
    if (options.folder && info.folderKey !== options.folder || options.tag && !info.tags.includes(options.tag) ||
      options.usage === "used" && !assetUsages.length || options.usage === "unused" && assetUsages.length) continue;
    if (query && ![path, info.displayName, folderName, ...info.tags, ...assetUsages.map((usage) => usage.label)]
      .some((value) => value.toLowerCase().includes(query))) continue;
    items.push({
      path,
      url: hasDraft ? draftMediaUrl(path) : publicMediaUrl(path),
      status: hasDraft && hasPublished ? "Draft + Published" : hasDraft ? "Draft" : "Published",
      hasDraft,
      hasPublished,
      createdAt: entry.created_at,
      size: typeof entry.metadata?.size === "number" ? entry.metadata.size : null,
      usages: assetUsages,
      canDelete: hasDraft && !hasPublished && assetUsages.length === 0,
      displayName: info.displayName, altText: info.altText, folderKey: info.folderKey, folderName,
      tags: info.tags, width: info.width, height: info.height, parentPath: info.parentPath,
    });
  }
  const hasMore = streams.some((stream) => stream.index < stream.entries.length || !stream.exhausted);
  return {
    items,
    nextCursor: hasMore ? Buffer.from(JSON.stringify({ query, filter, folder: options.folder ?? "", tag: options.tag ?? "", usage: options.usage ?? "all", offsets: streams.map((stream) => stream.offset) })).toString("base64url") : null,
    folders,
  };
}

export async function deleteUnusedDraftMedia(path: string): Promise<"deleted" | "in-use" | "not-found"> {
  const client = await createAuthorizedCmsClient();
  if (!isMediaPath(path)) return "not-found";
  const storage = createAdminClient().storage;
  const usages = await getMediaUsage(client);
  if (usages.has(path) || await objectExists(storage, PUBLIC_MEDIA_BUCKET, path)) return "in-use";
  const admin = createAdminClient();
  const { count, error: childError } = await admin.from("media_assets").select("storage_path", { count: "exact", head: true }).eq("parent_path", path);
  if (childError || (count ?? 0) > 0) return "in-use";
  if (!await objectExists(storage, DRAFT_MEDIA_BUCKET, path)) return "not-found";
  const { error } = await storage.from(DRAFT_MEDIA_BUCKET).remove([path]);
  if (error) throw new Error("Unable to delete media.");
  await admin.from("media_assets").delete().eq("storage_path", path);
  return "deleted";
}
