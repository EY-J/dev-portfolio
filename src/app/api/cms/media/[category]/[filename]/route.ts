import { getAdminAccess } from "@/features/cms/auth/service";
import { DRAFT_MEDIA_BUCKET, isMediaPath } from "@/features/cms/media/paths";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function notFound() {
  return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
}

export async function GET(_request: Request, context: { params: Promise<{ category: string; filename: string }> }) {
  const access = await getAdminAccess();
  if (access.status !== "allowed") return notFound();

  const { category, filename } = await context.params;
  const path = `${category}/${filename}`;
  if (!isMediaPath(path)) return notFound();

  try {
    const { data, error } = await createAdminClient().storage.from(DRAFT_MEDIA_BUCKET).download(path);
    if (error || !data) return notFound();
    return new Response(await data.arrayBuffer(), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  } catch {
    return notFound();
  }
}
