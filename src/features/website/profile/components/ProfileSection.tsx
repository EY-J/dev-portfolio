import Image from "next/image";

import type { PublicProfile } from "@/features/website/profile/types";

interface ProfileSectionProps {
  profile: PublicProfile | null;
}

export default function ProfileSection({ profile }: ProfileSectionProps) {
  if (!profile) {
    return (
      <section id="about">
        <p>Profile information is not available yet.</p>
      </section>
    );
  }

  return (
    <section id="about">
      {profile.avatarUrl ? (
        <Image
          alt={profile.name}
          height={240}
          src={profile.avatarUrl}
          unoptimized
          width={240}
        />
      ) : null}
      <h2>{profile.name}</h2>
      <p>{profile.title}</p>
      <p>{profile.bio}</p>
      {profile.resumeUrl ? (
        <a href={profile.resumeUrl} rel="noreferrer" target="_blank">
          View resume
        </a>
      ) : null}
    </section>
  );
}
