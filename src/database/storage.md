# Supabase Storage

## `project-images`

Legacy public bucket used by existing project images. Published snapshots may
still reference these URLs. The CMS no longer writes new images here.

## Managed media

Migration `20261010000100_cms_media.sql` creates `portfolio-drafts` (private)
and `portfolio-public` (public). Browser roles cannot write either bucket or
read the draft bucket. CMS media requests pass the normal Supabase session,
allowlist, and absolute one-hour CMS session check before a server-only Storage
client acts. Draft image references use `/api/cms/media/<category>/<uuid>.webp`.
The private route checks CMS access on every image request.

Uploads accept JPEG, PNG, and WebP up to 10 MB. Sharp validates decoded image
type and dimensions, applies EXIF orientation, resizes only when larger than
2400 by 2400, and writes WebP at high quality (near lossless for PNG input)
while preserving alpha. We keep
the processed asset only. Source files are not duplicated because the current
workflow has no reprocessing need. Raster images are never converted to SVG.

Publishing copies referenced draft files to the public bucket, then the
publication RPC verifies public objects and changes image references in the
published payload to `/api/media/<category>/<uuid>.webp`. No private or signed
URL is stored in a published snapshot. Existing public files remain available
during draft replacement and after later publications. Uploads that are never
saved or published, plus obsolete published files, may need manual cleanup;
automated garbage collection is deferred.

## CMS Media Library

`/admin/media` lists objects from the existing `portfolio-drafts` and
`portfolio-public` buckets. Identical relative paths are shown as one item.
Profile, project, and blog draft rows plus the latest published snapshot supply
usage labels. Storage remains the only location for binary image bytes.

The library is the only visible upload entry point. It uploads standalone
images under `media/<uuid>.webp` using the same processor and private bucket.
Profile, Project, and Blog forms only select existing paths. Migration
`20261010000300_media_library_namespace.sql` extends only the publication media
URL validator to accept `media/`; it requires manual review and must follow the
UUID correction migration. Until it is applied, new library images can be
uploaded and selected in drafts, but publishing those references will fail
validation. Uploading an unused image never promotes it.

The library permits deletion only for an unreferenced draft-only object. It
checks draft content and the latest publication again on the server before
deletion. All public-bucket objects remain protected, including objects absent
from the latest snapshot, because older publication revisions may reference
them. Historical cleanup remains deferred.

Migration `20261010000400_media_asset_metadata.sql` adds locked-down metadata
tables for stable display names, metadata-only folders, tags, dimensions, default
alt text, and a single crop parent path. It is new and must be reviewed and
applied manually after the media namespace migration. The service role accesses
these tables only after the normal CMS authorization check. Existing Storage
objects are shown with a contextual fallback name and can be registered by
editing details; no binary migration or Storage path move is needed.
Before the metadata migration is applied, listing and selection retain their
Storage-backed fallback behavior. New Media uploads and metadata edits require
the migration and fail closed until it is applied.

Media-only folder, name, and tag changes never enter a publication snapshot.
The SQL publication helper copies only default alt text for a referenced image
into backward-compatible `avatarAlt` / `imageAlt` fields. A NULL alt means no
default, so existing contextual alt text remains in use. An explicitly saved
empty alt marks an image decorative. An edit to the alt of a used image changes
the candidate published payload and makes the site show unpublished changes;
organizing folders and tags does not. Draft preview reads the same default alt
without changing draft URLs. A crop creates a new WebP in `portfolio-drafts`
and records its parent path; the original object is untouched. Only crops
referenced by saved portfolio content are promoted on publish.

The content schema still has URL fields, so old published revisions and both
portfolio presentations remain compatible. Context-specific alt overrides and
automated historical cleanup remain future work.
