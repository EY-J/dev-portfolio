import "server-only";

import { createAuthorizedCmsClient } from "@/features/cms/auth/service";
import { isMediaPath } from "@/features/cms/media/paths";
import { createAdminClient } from "@/lib/supabase/admin";

export interface MediaFolder { key: string; name: string; systemFolder: boolean }
export interface MediaMetadata {
  path: string;
  displayName: string;
  altText: string | null;
  folderKey: string;
  tags: string[];
  width: number | null;
  height: number | null;
  parentPath: string | null;
}

type Row = Record<string, unknown>;
const DEFAULT_FOLDERS: MediaFolder[] = [
  { key: "profile", name: "Profile", systemFolder: true },
  { key: "projects", name: "Projects", systemFolder: true },
  { key: "blog", name: "Blog", systemFolder: true },
  { key: "general", name: "General", systemFolder: true },
];

function isMissingMetadataTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

function parseRow(row: Row): MediaMetadata {
  return {
    path: String(row.storage_path), displayName: String(row.display_name),
    altText: typeof row.alt_text === "string" ? row.alt_text : null, folderKey: String(row.folder_key ?? "general"),
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
    width: typeof row.width === "number" ? row.width : null,
    height: typeof row.height === "number" ? row.height : null,
    parentPath: typeof row.parent_path === "string" ? row.parent_path : null,
  };
}

export function fallbackMetadata(path: string, usageLabel?: string): MediaMetadata {
  const category = path.split("/")[0];
  const displayName = usageLabel?.replace(/^(Profile|Project|Blog) → /, "") ||
    ({ profile: "Profile image", projects: "Project image", blog: "Blog image", media: "Media image" }[category] ?? "Media image");
  return { path, displayName, altText: null, folderKey: category === "media" ? "general" : category,
    tags: [], width: null, height: null, parentPath: null };
}

export async function readMediaMetadata(): Promise<{ assets: Map<string, MediaMetadata>; folders: MediaFolder[] }> {
  await createAuthorizedCmsClient();
  const admin = createAdminClient();
  const [folderResult, assetResult] = await Promise.all([
    admin.from("media_folders").select("key,name,system_folder").order("created_at"),
    admin.from("media_assets").select("storage_path,display_name,alt_text,folder_key,tags,width,height,parent_path").order("storage_path").range(0, 999),
  ]);
  if (isMissingMetadataTable(folderResult.error) || isMissingMetadataTable(assetResult.error)) {
    return { assets: new Map(), folders: DEFAULT_FOLDERS };
  }
  if (folderResult.error || assetResult.error) throw new Error("Unable to load media metadata.");
  const assets = new Map<string, MediaMetadata>();
  for (const row of assetResult.data ?? []) assets.set(row.storage_path, parseRow(row));
  let offset = 1000;
  while ((assetResult.data?.length ?? 0) === 1000) {
    const page = await admin.from("media_assets").select("storage_path,display_name,alt_text,folder_key,tags,width,height,parent_path").order("storage_path").range(offset, offset + 999);
    if (page.error) throw new Error("Unable to load media metadata.");
    for (const row of page.data ?? []) assets.set(row.storage_path, parseRow(row));
    if ((page.data?.length ?? 0) < 1000) break;
    offset += 1000;
  }
  return { assets, folders: (folderResult.data?.length ? folderResult.data.map((row) => ({ key: row.key, name: row.name, systemFolder: row.system_folder })) : DEFAULT_FOLDERS) };
}

export async function getMediaMetadata(path: string): Promise<MediaMetadata | null> {
  await createAuthorizedCmsClient();
  if (!isMediaPath(path)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.from("media_assets")
    .select("storage_path,display_name,alt_text,folder_key,tags,width,height,parent_path")
    .eq("storage_path", path).maybeSingle();
  if (isMissingMetadataTable(error)) return null;
  if (error) throw new Error("Unable to read media details.");
  return data ? parseRow(data) : null;
}

export async function saveMediaMetadata(path: string, input: { displayName: unknown; altText: unknown; folderKey: unknown; tags: unknown }): Promise<MediaMetadata> {
  await createAuthorizedCmsClient();
  if (!isMediaPath(path)) throw new Error("Invalid media path.");
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  const altText = input.altText === null ? null : typeof input.altText === "string" ? input.altText.trim() : undefined;
  const folderKey = typeof input.folderKey === "string" ? input.folderKey : "";
  const tags = Array.isArray(input.tags) ? [...new Set(input.tags.map((value) => typeof value === "string" ? value.trim().toLowerCase() : ""))].filter(Boolean) : [];
  if (!displayName || displayName.length > 160 || altText === undefined || (altText?.length ?? 0) > 500 || tags.length > 20 || tags.some((tag) => tag.length > 40 || !/^[\p{L}\p{N}][\p{L}\p{N} -]*$/u.test(tag))) {
    throw new Error("Check the media name, alt text, and tags.");
  }
  const admin = createAdminClient();
  const { data: folder, error: folderError } = await admin.from("media_folders").select("key").eq("key", folderKey).maybeSingle();
  if (folderError || !folder) throw new Error("Choose a valid folder.");
  const storage = admin.storage;
  const [draft, published] = await Promise.all([
    storage.from("portfolio-drafts").exists(path), storage.from("portfolio-public").exists(path),
  ]);
  if (!draft.data && !published.data) throw new Error("Media object not found.");
  const { data: prior, error: priorError } = await admin.from("media_assets").select("storage_path,display_name,alt_text,folder_key,tags,width,height,parent_path").eq("storage_path", path).maybeSingle();
  if (priorError) throw new Error("Unable to load media details.");
  const fallback = fallbackMetadata(path);
  const { data, error } = await admin.from("media_assets").upsert({
    storage_path: path, display_name: displayName, alt_text: altText, folder_key: folderKey, tags,
    width: prior?.width ?? null, height: prior?.height ?? null, parent_path: prior?.parent_path ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "storage_path" }).select("storage_path,display_name,alt_text,folder_key,tags,width,height,parent_path").single();
  if (error || !data) throw new Error("Unable to save media details.");
  return parseRow(data ?? { ...fallback, storage_path: path });
}

export async function createMediaFolder(nameInput: unknown): Promise<MediaFolder> {
  await createAuthorizedCmsClient();
  const name = typeof nameInput === "string" ? nameInput.trim() : "";
  if (!name || name.length > 80) throw new Error("Enter a folder name up to 80 characters.");
  const key = `custom-${crypto.randomUUID()}`;
  const { data, error } = await createAdminClient().from("media_folders").insert({ key, name }).select("key,name,system_folder").single();
  if (error || !data) throw new Error("Unable to create folder. The name may already exist.");
  return { key: data.key, name: data.name, systemFolder: data.system_folder };
}

export async function bulkUpdateMedia(paths: string[], change: { folderKey?: unknown; addTags?: unknown; removeTags?: unknown }): Promise<number> {
  await createAuthorizedCmsClient();
  const unique = [...new Set(paths)];
  if (!unique.length || unique.length > 100 || unique.some((path) => typeof path !== "string" || !isMediaPath(path))) throw new Error("Select up to 100 valid images.");
  const { assets, folders } = await readMediaMetadata();
  const folderKey = change.folderKey;
  if (folderKey !== undefined && (typeof folderKey !== "string" || !folders.some((folder) => folder.key === folderKey))) throw new Error("Choose a valid folder.");
  const addTags = typeof change.addTags === "string" ? change.addTags.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean) : [];
  const removeTags = typeof change.removeTags === "string" ? change.removeTags.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean) : [];
  if ([...addTags, ...removeTags].some((tag) => tag.length > 40 || !/^[\p{L}\p{N}][\p{L}\p{N} -]*$/u.test(tag))) throw new Error("Invalid tag.");
  const admin = createAdminClient();
  let count = 0;
  for (const path of unique) {
    const [draft, published] = await Promise.all([
      admin.storage.from("portfolio-drafts").exists(path), admin.storage.from("portfolio-public").exists(path),
    ]);
    if (!draft.data && !published.data) throw new Error(`Updated ${count} images before a missing object stopped the operation.`);
    const current = assets.get(path) ?? fallbackMetadata(path);
    const tags = [...new Set([...current.tags.filter((tag) => !removeTags.includes(tag)), ...addTags])];
    if (tags.length > 20) throw new Error("An image cannot have more than 20 tags.");
    const updated = await admin.from("media_assets").upsert({
      storage_path: path, display_name: current.displayName, alt_text: current.altText,
      folder_key: typeof folderKey === "string" ? folderKey : current.folderKey,
      tags, width: current.width, height: current.height, parent_path: current.parentPath,
      updated_at: new Date().toISOString(),
    }, { onConflict: "storage_path" });
    if (updated.error) throw new Error(`Updated ${count} images before the operation stopped.`);
    count++;
  }
  return count;
}
