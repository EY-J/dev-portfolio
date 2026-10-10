"use client";

import { useState } from "react";
import Image from "next/image";

export default function SimpleProjectPreview({ imageUrl, index, title, alt }: { imageUrl: string | null; index: number; title: string; alt?: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!imageUrl || imageFailed) {
    return (
      <div aria-label={`Preview unavailable for ${title}`} className="simple-project-placeholder" role="img">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <span>{title}</span>
      </div>
    );
  }

  return <Image alt={alt ?? `Preview of ${title}`} className="simple-project-image" fill onError={() => setImageFailed(true)} sizes="(max-width: 760px) 100vw, 55vw" src={imageUrl} unoptimized />;
}
