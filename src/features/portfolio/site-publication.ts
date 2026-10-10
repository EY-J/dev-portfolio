import "server-only";

import { cache } from "react";

import { requireAdmin } from "@/features/cms/auth/service";
import { draftMediaPath, DRAFT_MEDIA_BUCKET, isMediaPath, PUBLIC_MEDIA_BUCKET } from "@/features/cms/media/paths";
import type { PortfolioData } from "@/features/portfolio/data";
import { getStoredPortfolioVariant } from "@/features/portfolio/variant-service";
import { isPortfolioVariant, type PortfolioVariant } from "@/features/portfolio/variants";
import { normalizeAssetUrl, normalizeHttpUrl, normalizeSocialUrl } from "@/features/portfolio/urls";
import { getPublicProfile } from "@/features/website/profile/service";
import { getPublicProjects } from "@/features/website/projects/service";
import { getPublicSocialLinks } from "@/features/website/social-links/service";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Experience } from "@/features/experience/types";

export interface PublicBlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  imageUrl?: string;
  imageAlt?: string;
}

export interface SitePublication {
  variant: PortfolioVariant;
  data: PortfolioData;
}

export interface SitePublicationStatus {
  available: boolean;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
  publishedVariant: PortfolioVariant;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export function parseSitePayload(value: unknown): SitePublication {
  const payload = record(value);
  if (!payload || !isPortfolioVariant(payload.variant) || !Array.isArray(payload.projects) || !Array.isArray(payload.socialLinks) || (payload.blogPosts !== undefined && !Array.isArray(payload.blogPosts)) || (payload.experiences !== undefined && !Array.isArray(payload.experiences))) {
    throw new Error("The site publication is invalid.");
  }

  const rawProfile = payload.profile === null ? null : record(payload.profile);
  if (payload.profile !== null && !rawProfile) throw new Error("The site profile is invalid.");
  const profile = rawProfile ? {
    name: text(rawProfile.name),
    title: text(rawProfile.title),
    bio: text(rawProfile.bio),
    avatarUrl: rawProfile.avatarUrl === "" ? "" : normalizeAssetUrl(rawProfile.avatarUrl) ?? undefined,
    avatarAlt: typeof rawProfile.avatarAlt === "string" ? rawProfile.avatarAlt : undefined,
    resumeUrl: normalizeAssetUrl(rawProfile.resumeUrl) ?? undefined,
  } : null;

  const projects = payload.projects.map((value) => {
    const project = record(value);
    if (!project || typeof project.id !== "string" || !Array.isArray(project.technologies)) throw new Error("A published project is invalid.");
    return {
      id: project.id,
      title: text(project.title),
      description: text(project.description),
      imageUrl: normalizeAssetUrl(project.imageUrl) ?? "",
      imageAlt: typeof project.imageAlt === "string" ? project.imageAlt : undefined,
      technologies: project.technologies.filter((item): item is string => typeof item === "string"),
      githubUrl: normalizeHttpUrl(project.githubUrl) ?? undefined,
      liveUrl: normalizeHttpUrl(project.liveUrl) ?? undefined,
    };
  });

  const socialLinks = payload.socialLinks.flatMap((value) => {
    const link = record(value);
    const href = normalizeSocialUrl(link?.href);
    return link && href ? [{ label: text(link.label), href }] : [];
  });

  const blogPosts = (payload.blogPosts ?? []).map((value) => {
    const post = record(value);
    if (!post || typeof post.id !== "string") throw new Error("A published blog post is invalid.");
    return {
      id: post.id,
      title: text(post.title),
      slug: text(post.slug),
      content: text(post.content),
      imageUrl: normalizeAssetUrl(post.imageUrl) ?? undefined,
      imageAlt: typeof post.imageAlt === "string" ? post.imageAlt : undefined,
    };
  });

  const experiences = (payload.experiences ?? []).map((value): Omit<Experience, "sortOrder"> => {
    const entry = record(value);
    if (!entry || typeof entry.id !== "string" || !Array.isArray(entry.technologies)) throw new Error("A published experience is invalid.");
    const companyUrl = normalizeHttpUrl(entry.companyUrl);
    return {
      id: entry.id, role: text(entry.role), company: text(entry.company),
      location: optionalText(entry.location) ?? null,
      startDate: text(entry.startDate), endDate: optionalText(entry.endDate) ?? null,
      isCurrent: entry.isCurrent === true, description: text(entry.description),
      technologies: entry.technologies.filter((item): item is string => typeof item === "string"),
      companyUrl: companyUrl?.startsWith("https://") ? companyUrl : null,
    };
  });

  return { variant: payload.variant, data: { profile, projects, socialLinks, blogPosts, experiences } };
}

function missingPublicationRpc(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

export class PublicationMediaError extends Error {
  constructor(readonly reason: "missing-source" | "promotion" = "promotion") {
    super(reason === "missing-source" ? "Draft media source is missing." : "Unable to prepare published media.");
    this.name = "PublicationMediaError";
  }
}

export class PublicationValidationError extends Error {
  constructor() {
    super("The draft failed publication validation.");
    this.name = "PublicationValidationError";
  }
}

function diagnostic(stage: string, error?: unknown, path?: string) {
  const details = record(error);
  const code = details?.statusCode ?? details?.code;
  console.error(`[publication] ${stage}`, {
    ...(path ? { kind: path.split("/")[0], path } : {}),
    ...(typeof details?.status === "number" ? { status: details.status } : {}),
    ...(typeof code === "string" && /^[a-zA-Z0-9_]{1,64}$/.test(code) ? { code } : {}),
  });
}

function mediaFailure(stage: string, path: string, error?: unknown): PublicationMediaError {
  diagnostic(stage, error, path);
  return new PublicationMediaError();
}

function mediaEvent(stage: string, path: string) {
  console.info(`[publication] ${stage}`, { kind: path.split("/")[0], path });
}

type MediaStorage = ReturnType<typeof createAdminClient>["storage"];

async function objectExists(
  storage: MediaStorage,
  bucket: typeof DRAFT_MEDIA_BUCKET | typeof PUBLIC_MEDIA_BUCKET,
  path: string,
  failureStage: string,
): Promise<boolean> {
  let result;
  try {
    result = await storage.from(bucket).exists(path);
  } catch (error) {
    throw mediaFailure(failureStage, path, error);
  }
  // storage-js returns data:false plus an error for both 400 and 404 HEAD misses.
  // This boolean contract is used only for our known buckets and validated paths.
  if (result.data === true) return true;
  if (result.data === false) return false;
  throw mediaFailure(failureStage, path, result.error);
}

async function promoteDraftMedia(storage: MediaStorage, path: string): Promise<void> {
  if (!isMediaPath(path)) throw mediaFailure("Invalid draft media path.", path);
  if (!await objectExists(storage, DRAFT_MEDIA_BUCKET, path, "Failed to check draft media source.")) {
    diagnostic("Draft media source is missing.", undefined, path);
    throw new PublicationMediaError("missing-source");
  }
  mediaEvent("Draft media exists.", path);
  if (await objectExists(storage, PUBLIC_MEDIA_BUCKET, path, "Failed to check public media.")) {
    mediaEvent("Public media already exists; reusing.", path);
    return;
  }
  mediaEvent("Public media missing; promoting.", path);

  let download;
  try {
    download = await storage.from(DRAFT_MEDIA_BUCKET).download(path);
  } catch (error) {
    throw mediaFailure("Failed to download draft media.", path, error);
  }
  if (download.error || !download.data) {
    throw mediaFailure("Failed to download draft media.", path, download.error);
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await download.data.arrayBuffer());
  } catch (error) {
    throw mediaFailure("Failed to read draft media bytes.", path, error);
  }

  let upload;
  try {
    upload = await storage.from(PUBLIC_MEDIA_BUCKET).upload(path, bytes, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
  } catch (error) {
    // A concurrent publish may have created the same UUID path.
    if (await objectExists(storage, PUBLIC_MEDIA_BUCKET, path, "Failed to verify promoted media.")) {
      mediaEvent("Public media already exists; reusing.", path);
      return;
    }
    throw mediaFailure("Failed to upload public media.", path, error);
  }
  if (upload.error) {
    if (await objectExists(storage, PUBLIC_MEDIA_BUCKET, path, "Failed to verify promoted media.")) {
      mediaEvent("Public media already exists; reusing.", path);
      return;
    }
    throw mediaFailure("Failed to upload public media.", path, upload.error);
  }
  if (!await objectExists(storage, PUBLIC_MEDIA_BUCKET, path, "Failed to verify promoted media.")) {
    throw mediaFailure("Failed to verify promoted media.", path);
  }
  mediaEvent("Public media promoted.", path);
}

export const getPublishedSite = cache(async (): Promise<SitePublication> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_published_site");
  if (!error) return parseSitePayload(data);
  if (!missingPublicationRpc(error)) throw new Error("Unable to load the published site.");

  // Deploy-first compatibility. Before the migration exists, the old public
  // tables still hold the live site. This path cannot read drafts once the
  // migration locks those tables down.
  const [profile, projects, socialLinks, variant] = await Promise.all([
    getPublicProfile().catch(() => null),
    getPublicProjects().catch(() => []),
    getPublicSocialLinks().catch(() => []),
    getStoredPortfolioVariant().catch(() => null),
  ]);
  return { variant: variant ?? "main", data: { profile, projects, socialLinks, blogPosts: [], experiences: [] } };
});

export async function getDraftSite(): Promise<SitePublication> {
  const user = await requireAdmin();
  const { data, error } = await createAdminClient().rpc("get_draft_site", { p_actor: user.id });
  if (error) throw new Error("Unable to load the draft preview.");
  return parseSitePayload(data);
}

export async function getSitePublicationStatus(): Promise<SitePublicationStatus> {
  const user = await requireAdmin();
  const { data, error } = await createAdminClient().rpc("get_site_publication_status", { p_actor: user.id });
  if (missingPublicationRpc(error)) return { available: false, hasUnpublishedChanges: false, publishedAt: null, publishedVariant: "main" };
  if (error) throw new Error("Unable to load publication status.");
  const status = record(data);
  if (!status || typeof status.hasUnpublishedChanges !== "boolean") throw new Error("Invalid publication status.");
  return {
    available: status.editingEnabled === true,
    hasUnpublishedChanges: status.hasUnpublishedChanges,
    publishedAt: optionalText(status.publishedAt) ?? null,
    publishedVariant: isPortfolioVariant(status.publishedVariant) ? status.publishedVariant : "main",
  };
}

export async function publishDraftSite(): Promise<void> {
  const user = await requireAdmin();
  const { data, error: draftError } = await createAdminClient().rpc("get_draft_site", { p_actor: user.id });
  if (draftError) {
    diagnostic("Failed to load draft.", draftError);
    throw new Error("Unable to read the draft for publication.");
  }
  const site = parseSitePayload(data);
  const paths = new Set([
    site.data.profile?.avatarUrl,
    ...site.data.projects.map((project) => project.imageUrl),
  ].flatMap((value) => {
    const path = draftMediaPath(value);
    return path ? [path] : [];
  }));

  if (paths.size) {
    let storage: MediaStorage;
    try {
      storage = createAdminClient().storage;
    } catch (error) {
      diagnostic("Failed to create media storage client.", error);
      throw new PublicationMediaError();
    }
    for (const path of paths) await promoteDraftMedia(storage, path);
  }
  // Media promotion can take time; enforce the absolute CMS deadline again.
  const publishingUser = await requireAdmin();
  if (publishingUser.id !== user.id) throw new Error("The CMS session changed during publication.");
  const { error } = await createAdminClient().rpc("publish_site", { p_actor: publishingUser.id });
  if (error) {
    if (error.message === "Draft media has not been promoted." || error.message === "Invalid draft media reference.") {
      diagnostic("publish_site RPC rejected media reference.", error);
      throw new PublicationMediaError();
    }
    diagnostic(error.code === "22023" ? "publish_site RPC rejected draft validation." : "publish_site RPC failed.", error);
    if (error.code === "22023") throw new PublicationValidationError();
    throw new Error("Unable to publish the draft site.");
  }
}
