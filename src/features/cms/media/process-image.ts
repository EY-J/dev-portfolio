import "server-only";

import sharp from "sharp";

import { MAX_MEDIA_BYTES } from "@/features/cms/media/paths";

const INPUT_FORMATS = {
  "image/jpeg": { format: "jpeg", extensions: ["jpg", "jpeg"] },
  "image/png": { format: "png", extensions: ["png"] },
  "image/webp": { format: "webp", extensions: ["webp"] },
} as const;

export async function processCmsImage(file: File): Promise<Buffer> {
  const input = INPUT_FORMATS[file.type as keyof typeof INPUT_FORMATS];
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!input || !extension || !(input.extensions as readonly string[]).includes(extension)) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  if (!file.size || file.size > MAX_MEDIA_BYTES) {
    throw new Error("Images must be 10 MB or smaller.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const image = sharp(bytes, { failOn: "error", limitInputPixels: 64_000_000 });
    const info = await image.metadata();
    if (info.format !== input.format || !info.width || !info.height ||
      info.width > 8000 || info.height > 8000 || (info.pages ?? 1) !== 1) {
      throw new Error("Invalid image.");
    }

    const output = await image.rotate().resize(2400, 2400, {
      fit: "inside",
      withoutEnlargement: true,
    }).webp({ quality: info.format === "png" ? 95 : 92, nearLossless: info.format === "png", alphaQuality: 100, effort: 5 }).toBuffer();
    if (output.length > MAX_MEDIA_BYTES) throw new Error("Processed image is too large.");
    return output;
  } catch {
    throw new Error("This image could not be processed. Choose a valid JPEG, PNG, or WebP file.");
  }
}
