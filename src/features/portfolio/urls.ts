const ROOT_ASSET_PATH = /^\/(?!\/)(?:[A-Za-z0-9._~/-]|%[0-9A-Fa-f]{2})+$/;
const MAILTO_ADDRESS = /^mailto:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\?[^\s\\]*)?$/i;

export function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value || value !== value.trim() || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function normalizeAssetUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (ROOT_ASSET_PATH.test(value) && !/%(?:2e|2f|5c)/i.test(value) &&
      !value.split("/").some((segment) => segment === "." || segment === "..")) {
    return value;
  }
  return normalizeHttpUrl(value);
}

export function normalizeSocialUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (MAILTO_ADDRESS.test(value)) return value;
  return normalizeHttpUrl(value);
}
