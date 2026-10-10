import { getAdminAccess } from "@/features/cms/auth/service";
import { DRAFT_MEDIA_BUCKET, MAX_MEDIA_BYTES } from "@/features/cms/media/paths";
import { processCmsImage } from "@/features/cms/media/process-image";
import { createAdminClient } from "@/lib/supabase/admin";
import sharp from "sharp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await getAdminAccess();
  if (access.status !== "allowed") return Response.json({ error: "Admin access is required." }, { status: 403 });

  if (Number(request.headers.get("content-length")) > MAX_MEDIA_BYTES + 1024 * 1024) {
    return Response.json({ error: "Images must be 10 MB or smaller." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Unable to read the image." }, { status: 400 });
  }
  const category = form.get("category");
  const file = form.get("file");
  if (category !== "media" || !(file instanceof File)) {
    return Response.json({ error: "Choose an image to upload." }, { status: 400 });
  }
  const folderKey = form.get("folderKey");
  const folder = typeof folderKey === "string" && folderKey ? folderKey : "general";
  const admin = createAdminClient();
  const folderResult = await admin.from("media_folders").select("key").eq("key", folder).maybeSingle();
  if (folderResult.error || !folderResult.data) {
    return Response.json({ error: "Media metadata is unavailable or the folder is invalid." }, { status: 400 });
  }

  let bytes: Buffer;
  try {
    bytes = await processCmsImage(file);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to upload image." }, { status: 400 });
  }

  const path = `media/${crypto.randomUUID()}.webp`;
  const dimensions = await sharp(bytes).metadata();
  const safeFilename = file.name.split(/[\\/]/).at(-1) ?? "";
  const displayName = safeFilename.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N} _.-]/gu, " ")
    .replace(/^[\s.-]+|[\s.-]+$/g, "").replace(/\s+/g, " ").slice(0, 160) || "New image";
  try {
    const { error } = await admin.storage.from(DRAFT_MEDIA_BUCKET).upload(path, bytes, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: false,
    });
    if (error) throw error;
    const created = await admin.from("media_assets").insert({ storage_path: path, display_name: displayName,
      alt_text: null, folder_key: folder, tags: [], width: dimensions.width, height: dimensions.height });
    if (created.error) {
      await admin.storage.from(DRAFT_MEDIA_BUCKET).remove([path]);
      throw created.error;
    }
  } catch {
    return Response.json({ error: "Unable to upload image." }, { status: 500 });
  }
  return Response.json({ url: `/api/cms/media/${path}`, path }, { headers: { "Cache-Control": "private, no-store" } });
}
