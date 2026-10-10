import { getAdminAccess } from "@/features/cms/auth/service";
import { getMediaMetadata } from "@/features/cms/media/metadata";

export async function GET(request: Request) {
  const access = await getAdminAccess();
  if (access.status !== "allowed") return Response.json({ error: "Admin access is required." }, { status: 403 });
  const path = new URL(request.url).searchParams.get("path") ?? "";
  try {
    return Response.json({ asset: await getMediaMetadata(path) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Unable to read media details." }, { status: 500 });
  }
}
