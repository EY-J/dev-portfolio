import Image from "next/image";

import type { PublicProfile } from "@/features/website/profile/types";

interface ProfileSectionProps {
  profile: PublicProfile | null;
}

export default function ProfileSection({ profile }: ProfileSectionProps) {
  if (!profile) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6" id="about">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">About</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">A little about me</h2>
        <p className="mt-5 text-sm text-slate-600">Profile information is not available yet.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-[minmax(0,1fr)_15rem] md:items-center" id="about">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">About</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{profile.name}</h2>
        <p className="mt-3 text-base font-medium text-slate-700">{profile.title}</p>
        <p className="mt-6 max-w-2xl whitespace-pre-wrap text-sm leading-8 text-slate-600">{profile.bio}</p>
        {profile.resumeUrl ? (
          <a className="mt-6 inline-flex text-sm font-semibold text-slate-900 underline underline-offset-4 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900" href={profile.resumeUrl} rel="noreferrer" target="_blank">
            View resume
          </a>
        ) : null}
      </div>
      {profile.avatarUrl ? (
        <Image
          alt={profile.name}
          className="aspect-square w-48 rounded-2xl object-cover shadow-sm md:w-full"
          height={240}
          src={profile.avatarUrl}
          unoptimized
          width={240}
        />
      ) : null}
    </section>
  );
}
