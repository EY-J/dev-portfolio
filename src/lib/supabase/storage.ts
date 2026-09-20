import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

const PROJECT_IMAGES_BUCKET = "project-images";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type StorageClient = Pick<SupabaseClient, "storage">;

export interface ProjectImageUpload {
  path: string;
  publicUrl: string;
}

function getProjectImagePath(imagePathOrUrl: string): string | null {
  if (!/^https?:\/\//i.test(imagePathOrUrl)) {
    return imagePathOrUrl || null;
  }

  try {
    const url = new URL(imagePathOrUrl);
    const supabaseOrigin = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL!
    ).origin;
    const marker = `/storage/v1/object/public/${PROJECT_IMAGES_BUCKET}/`;

    if (url.origin !== supabaseOrigin || !url.pathname.startsWith(marker)) {
      return null;
    }

    return decodeURIComponent(url.pathname.slice(marker.length)) || null;
  } catch {
    return null;
  }
}

export function getProjectImageUrl(
  path: string,
  client: StorageClient = createClient()
): string {
  return client.storage.from(PROJECT_IMAGES_BUCKET).getPublicUrl(path).data
    .publicUrl;
}

export async function uploadProjectImage(
  file: File,
  client: StorageClient = createClient()
): Promise<ProjectImageUpload> {
  const extension = IMAGE_EXTENSIONS[file.type];

  if (!extension) {
    throw new Error("Choose a JPEG, PNG, WebP, GIF, or AVIF image.");
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("Project images must be 5 MB or smaller.");
  }

  const path = `projects/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await client.storage
    .from(PROJECT_IMAGES_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error("Unable to upload the image.");
  }

  return {
    path: data.path,
    publicUrl: getProjectImageUrl(data.path, client),
  };
}

export async function deleteProjectImage(
  imagePathOrUrl: string,
  client: StorageClient = createClient()
): Promise<void> {
  const path = getProjectImagePath(imagePathOrUrl);

  if (!path) {
    return;
  }

  const { error } = await client.storage
    .from(PROJECT_IMAGES_BUCKET)
    .remove([path]);

  if (error) {
    throw new Error("Unable to delete the project image.");
  }
}
