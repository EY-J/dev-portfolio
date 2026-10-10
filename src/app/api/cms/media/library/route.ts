import { getAdminAccess } from "@/features/cms/auth/service";
import { deleteUnusedDraftMedia, listManagedMedia } from "@/features/cms/media/library-service";
import type { MediaFilter, MediaUsageFilter } from "@/features/cms/media/library-types";
import { bulkUpdateMedia, createMediaFolder, saveMediaMetadata } from "@/features/cms/media/metadata";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const access = await getAdminAccess();
  if (access.status !== "allowed") return Response.json({ error: "Admin access is required." }, { status: 403, headers: privateHeaders });
  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? "";
  const filter = url.searchParams.get("filter") ?? "all";
  const cursor = url.searchParams.get("cursor");
  const folder = url.searchParams.get("folder") ?? "";
  const tag = url.searchParams.get("tag") ?? "";
  const usage = url.searchParams.get("usage") ?? "all";
  if (query.length > 100 || folder.length > 80 || tag.length > 40 ||
    !(["all", "draft", "published", "both"] as string[]).includes(filter) ||
    !(["all", "used", "unused"] as string[]).includes(usage) || (cursor?.length ?? 0) > 1024) {
    return Response.json({ error: "Invalid media search." }, { status: 400, headers: privateHeaders });
  }
  try {
    const page = await listManagedMedia(query, filter as MediaFilter, cursor, { folder, tag, usage: usage as MediaUsageFilter });
    return Response.json(page, { headers: privateHeaders });
  } catch {
    return Response.json({ error: "Unable to load media." }, { status: 500, headers: privateHeaders });
  }
}

export async function PATCH(request: Request) {
  const access = await getAdminAccess();
  if (access.status !== "allowed") return Response.json({ error: "Admin access is required." }, { status: 403, headers: privateHeaders });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "folder") return Response.json({ folder: await createMediaFolder(body.name) }, { headers: privateHeaders });
    if (body.action === "bulk" && Array.isArray(body.paths)) {
      const count = await bulkUpdateMedia(body.paths, { folderKey: body.folderKey, addTags: body.addTags, removeTags: body.removeTags });
      return Response.json({ count }, { headers: privateHeaders });
    }
    if (body.action === "details" && typeof body.path === "string") {
      const asset = await saveMediaMetadata(body.path, { displayName: body.displayName, altText: body.altText, folderKey: body.folderKey, tags: body.tags });
      revalidatePath("/admin", "layout");
      revalidatePath("/authpreview");
      return Response.json({ asset }, { headers: privateHeaders });
    }
    return Response.json({ error: "Invalid media request." }, { status: 400, headers: privateHeaders });
  } catch {
    return Response.json({ error: "Unable to save media details." }, { status: 400, headers: privateHeaders });
  }
}

export async function DELETE(request: Request) {
  const access = await getAdminAccess();
  if (access.status !== "allowed") return Response.json({ error: "Admin access is required." }, { status: 403, headers: privateHeaders });
  let path: unknown;
  try {
    path = (await request.json() as { path?: unknown }).path;
  } catch {
    return Response.json({ error: "Invalid media request." }, { status: 400, headers: privateHeaders });
  }
  if (typeof path !== "string") return Response.json({ error: "Invalid media request." }, { status: 400, headers: privateHeaders });
  try {
    const outcome = await deleteUnusedDraftMedia(path);
    if (outcome === "in-use") return Response.json({ error: "Unable to delete image because it is in use or protected by publication history." }, { status: 409, headers: privateHeaders });
    if (outcome === "not-found") return Response.json({ error: "Image not found." }, { status: 404, headers: privateHeaders });
    return Response.json({ deleted: true }, { headers: privateHeaders });
  } catch {
    return Response.json({ error: "Unable to delete image." }, { status: 500, headers: privateHeaders });
  }
}
