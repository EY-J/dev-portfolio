export type MediaStatus = "Draft" | "Published" | "Draft + Published";
export type MediaFilter = "all" | "draft" | "published" | "both";
export type MediaUsageFilter = "all" | "used" | "unused";
export interface MediaSearchOptions { folder?: string; tag?: string; usage?: MediaUsageFilter }
export interface MediaFolder { key: string; name: string; systemFolder: boolean }

export interface MediaUsage {
  scope: "Draft" | "Published";
  label: string;
}

export interface MediaAsset {
  path: string;
  url: string;
  status: MediaStatus;
  hasDraft: boolean;
  hasPublished: boolean;
  createdAt: string | null;
  size: number | null;
  usages: MediaUsage[];
  canDelete: boolean;
  displayName: string;
  altText: string | null;
  folderKey: string;
  folderName: string;
  tags: string[];
  width: number | null;
  height: number | null;
  parentPath: string | null;
}

export interface MediaPage {
  items: MediaAsset[];
  nextCursor: string | null;
  folders: MediaFolder[];
}
