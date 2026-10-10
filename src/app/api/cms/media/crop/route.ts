import { getAdminAccess } from "@/features/cms/auth/service";
import { createMediaCrop, type CropRect } from "@/features/cms/media/crop-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await getAdminAccess();
  if (access.status !== "allowed") return Response.json({ error: "Admin access is required." }, { status: 403 });
  try {
    const input = await request.json() as { path?: unknown; rect?: CropRect };
    if (typeof input.path !== "string" || !input.rect || typeof input.rect !== "object") throw new Error("Invalid crop.");
    const path = await createMediaCrop(input.path, input.rect);
    return Response.json({ path }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Unable to create crop. Check the selection and try again." }, { status: 400 });
  }
}
