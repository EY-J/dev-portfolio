import { requireAdmin } from "@/features/cms/auth/service";
import MediaBrowser from "@/features/cms/media/components/MediaBrowser";

export default async function MediaPage() {
  await requireAdmin();
  return <main className="mx-auto max-w-7xl"><MediaBrowser mode="library" /></main>;
}
