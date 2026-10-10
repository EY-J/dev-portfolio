export const DRAFT_MEDIA_BUCKET = "portfolio-drafts";
export const PUBLIC_MEDIA_BUCKET = "portfolio-public";
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

export type MediaCategory = "profile" | "projects" | "blog" | "media";

const MEDIA_PATH = /^(profile|projects|blog|media)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;
const DRAFT_MEDIA_PREFIX = "/api/cms/media/";
const PUBLIC_MEDIA_PREFIX = "/api/media/";

export function isMediaCategory(value: unknown): value is MediaCategory {
  return value === "profile" || value === "projects" || value === "blog" || value === "media";
}

export function isMediaPath(value: string): boolean {
  return MEDIA_PATH.test(value);
}

export function draftMediaUrl(path: string): string {
  if (!isMediaPath(path)) throw new Error("Invalid media path.");
  return `${DRAFT_MEDIA_PREFIX}${path}`;
}

export function publicMediaUrl(path: string): string {
  if (!isMediaPath(path)) throw new Error("Invalid media path.");
  return `${PUBLIC_MEDIA_PREFIX}${path}`;
}

export function draftMediaPath(value: string | null | undefined): string | null {
  if (!value?.startsWith(DRAFT_MEDIA_PREFIX)) return null;
  const path = value.slice(DRAFT_MEDIA_PREFIX.length);
  return isMediaPath(path) ? path : null;
}

export function publicMediaPath(value: string | null | undefined): string | null {
  if (!value?.startsWith(PUBLIC_MEDIA_PREFIX)) return null;
  const path = value.slice(PUBLIC_MEDIA_PREFIX.length);
  return isMediaPath(path) ? path : null;
}

export function selectedMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return draftMediaPath(value) || publicMediaPath(value) ? value : null;
}
