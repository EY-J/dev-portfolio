import { isMediaPath, PUBLIC_MEDIA_BUCKET } from "@/features/cms/media/paths";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ category: string; filename: string }> }) {
  const { category, filename } = await context.params;
  const path = `${category}/${filename}`;
  if (!isMediaPath(path)) return new Response(null, { status: 404 });

  try {
    const client = await createClient();
    const { data, error } = await client.storage.from(PUBLIC_MEDIA_BUCKET).download(path);
    if (error || !data) return new Response(null, { status: 404 });
    return new Response(await data.arrayBuffer(), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
