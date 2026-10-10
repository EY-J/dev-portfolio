export async function uploadCmsMedia(file: File, folderKey = "general"): Promise<string> {
  const form = new FormData();
  form.set("category", "media");
  form.set("folderKey", folderKey);
  form.set("file", file);
  const response = await fetch("/api/cms/media", { method: "POST", body: form, cache: "no-store" });
  const result: { url?: string; error?: string } = await response.json();
  if (!response.ok || !result.url) throw new Error(result.error || "Unable to upload image.");
  return result.url;
}
