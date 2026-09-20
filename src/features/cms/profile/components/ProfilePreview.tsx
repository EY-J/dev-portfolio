import Image from "next/image";

import type { Profile } from "@/types/profile";

interface ProfilePreviewProps {
  profile: Profile;
}

export default function ProfilePreview({ profile }: ProfilePreviewProps) {
  return (
    <article className="space-y-3">
      {profile.avatarUrl ? (
        <Image
          alt={profile.name}
          className="aspect-square rounded-lg border border-slate-200 object-cover"
          height={160}
          src={profile.avatarUrl}
          unoptimized
          width={160}
        />
      ) : null}
      <h2 className="text-lg font-semibold">{profile.name}</h2>
      <p className="text-sm font-medium text-slate-700">{profile.title}</p>
      <p className="text-sm leading-6 text-slate-600">{profile.bio}</p>
      {profile.resumeUrl ? (
        <a className="inline-flex text-sm font-medium text-slate-950 underline underline-offset-4" href={profile.resumeUrl} rel="noreferrer" target="_blank">
          View resume
        </a>
      ) : null}
    </article>
  );
}
