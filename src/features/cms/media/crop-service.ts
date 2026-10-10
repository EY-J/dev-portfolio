import "server-only";

import sharp from "sharp";

import { createAuthorizedCmsClient } from "@/features/cms/auth/service";
import { fallbackMetadata, readMediaMetadata } from "@/features/cms/media/metadata";
import { DRAFT_MEDIA_BUCKET, isMediaPath, MAX_MEDIA_BYTES, PUBLIC_MEDIA_BUCKET } from "@/features/cms/media/paths";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CropRect { x: number; y: number; width: number; height: number }

export function pixelCrop(rect: CropRect, width: number, height: number) {
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1) ||
    rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > 1.000001 || rect.y + rect.height > 1.000001) {
    throw new Error("Invalid crop bounds.");
  }
  const left = Math.floor(rect.x * width);
  const top = Math.floor(rect.y * height);
  const right = Math.min(width, Math.ceil((rect.x + rect.width) * width));
  const bottom = Math.min(height, Math.ceil((rect.y + rect.height) * height));
  if (right <= left || bottom <= top) throw new Error("Crop is too small.");
  return { left, top, width: right - left, height: bottom - top };
}

export async function createMediaCrop(path: string, rect: CropRect): Promise<string> {
  await createAuthorizedCmsClient();
  if (!isMediaPath(path)) throw new Error("Invalid media path.");
  const { assets } = await readMediaMetadata();
  const original = assets.get(path) ?? fallbackMetadata(path);
  if (original.parentPath) throw new Error("Crop the original image to avoid repeated recompression.");
  const admin = createAdminClient();
  const storage = admin.storage;
  const draft = await storage.from(DRAFT_MEDIA_BUCKET).exists(path);
  const bucket = draft.data ? DRAFT_MEDIA_BUCKET : PUBLIC_MEDIA_BUCKET;
  if (!draft.data && !(await storage.from(PUBLIC_MEDIA_BUCKET).exists(path)).data) throw new Error("Source image not found.");
  const download = await storage.from(bucket).download(path);
  if (download.error || !download.data) throw new Error("Unable to read source image.");
  const source = Buffer.from(await download.data.arrayBuffer());
  if (source.length > MAX_MEDIA_BYTES) throw new Error("Source image is too large.");
  const image = sharp(source, { failOn: "error", limitInputPixels: 64_000_000 });
  const info = await image.metadata();
  if (info.format !== "webp" || !info.width || !info.height || (info.pages ?? 1) !== 1) throw new Error("Invalid source image.");
  const crop = pixelCrop(rect, info.width, info.height);
  const bytes = await image.extract(crop).webp({ quality: 92, alphaQuality: 100, effort: 5 }).toBuffer();
  if (bytes.length > MAX_MEDIA_BYTES) throw new Error("Crop is too large.");
  if (!assets.has(path)) {
    const parent = await admin.from("media_assets").insert({ storage_path: path, display_name: original.displayName,
      alt_text: null, folder_key: original.folderKey, tags: [], width: info.width, height: info.height });
    if (parent.error) throw new Error("Unable to register source image.");
  }
  const newPath = `media/${crypto.randomUUID()}.webp`;
  const uploaded = await storage.from(DRAFT_MEDIA_BUCKET).upload(newPath, bytes, {
    cacheControl: "31536000", contentType: "image/webp", upsert: false,
  });
  if (uploaded.error) throw new Error("Unable to save cropped image.");
  const saved = await admin.from("media_assets").insert({
    storage_path: newPath, display_name: `${original.displayName.slice(0, 145)} — Crop`,
    alt_text: null, folder_key: original.folderKey, tags: original.tags,
    width: crop.width, height: crop.height, parent_path: path,
  });
  if (saved.error) {
    await storage.from(DRAFT_MEDIA_BUCKET).remove([newPath]);
    throw new Error("Unable to save crop details.");
  }
  return newPath;
}
