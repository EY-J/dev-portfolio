"use client";

import Image from "next/image";
import { useActionState, useState } from "react";

import { useCmsActionToast } from "@/components/admin/CmsToastProvider";
import { Button } from "@/components/ui/button";
import { createProfileAction, updateProfileAction } from "@/features/cms/profile/actions";
import CmsImageField from "@/features/cms/media/components/CmsImageField";
import type { ProfileActionState } from "@/features/cms/profile/types";
import type { Profile } from "@/types/profile";

interface ProfileFormProps {
  profile: Profile | null;
  initialMediaUrl?: string | null;
}

const initialState: ProfileActionState = { success: false, message: null };
const fieldClassName =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100";
const labelClassName = "block text-sm font-medium text-slate-700";
const valueClassName = "mt-1 whitespace-pre-line break-words text-sm leading-6 text-slate-950";

function profileDraft(profile: Profile | null, initialMediaUrl?: string | null) {
  return {
    name: profile?.name ?? "Aeron John",
    title: profile?.title ?? "Analyst Programmer",
    bio: profile?.bio ?? "",
    avatarUrl: initialMediaUrl ?? profile?.avatarUrl ?? "",
    resumeUrl: profile?.resumeUrl ?? "",
  };
}

function ProfileView({ profile, onEdit }: { profile: Profile; onEdit: () => void }) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Profile details</h2>
          <p className="mt-1 text-sm text-slate-600">Your saved draft profile.</p>
        </div>
        <Button onClick={onEdit} type="button" variant="outline">Edit profile</Button>
      </div>

      <section aria-labelledby="profile-view-basic" className="space-y-5">
        <h3 className="border-b border-slate-200 pb-3 text-base font-semibold text-slate-950" id="profile-view-basic">Basic information</h3>
        <dl className="grid gap-5 md:grid-cols-2">
          <div><dt className={labelClassName}>Full name</dt><dd className={valueClassName}>{profile.name}</dd></div>
          <div><dt className={labelClassName}>Professional title</dt><dd className={valueClassName}>{profile.title}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="profile-view-about" className="space-y-5">
        <h3 className="border-b border-slate-200 pb-3 text-base font-semibold text-slate-950" id="profile-view-about">About</h3>
        <dl><div><dt className={labelClassName}>About me</dt><dd className={profile.bio ? valueClassName : `${valueClassName} text-slate-500`}>{profile.bio || "Not provided yet."}</dd></div></dl>
      </section>

      <section aria-labelledby="profile-view-links" className="space-y-5">
        <h3 className="border-b border-slate-200 pb-3 text-base font-semibold text-slate-950" id="profile-view-links">Optional profile links</h3>
        <dl className="grid gap-5 md:grid-cols-2">
          <div>
            <dt className={labelClassName}>Hero / Profile image</dt>
            <dd className={valueClassName}>{profile.avatarUrl ? <Image alt={`${profile.name} portrait preview`} className="mt-2 h-auto max-h-52 w-auto max-w-full rounded-md border border-slate-200 object-contain" height={300} src={profile.avatarUrl} unoptimized width={300} /> : <span className="text-slate-500">Not provided</span>}</dd>
          </div>
          <div>
            <dt className={labelClassName}>Résumé</dt>
            <dd className={valueClassName}>{profile.resumeUrl ? <a className="underline underline-offset-4 hover:text-slate-600" href={profile.resumeUrl} rel="noopener noreferrer" target="_blank">View résumé<span className="sr-only"> (opens in a new tab)</span></a> : <span className="text-slate-500">Not provided</span>}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

export default function ProfileForm({ profile, initialMediaUrl }: ProfileFormProps) {
  const action = profile ? updateProfileAction.bind(null, profile.id) : createProfileAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [editing, setEditing] = useState(Boolean(initialMediaUrl));
  const [editStartedFrom, setEditStartedFrom] = useState(state);
  const [draft, setDraft] = useState(() => profileDraft(profile, initialMediaUrl));
  const [avatarRemoved, setAvatarRemoved] = useState(!initialMediaUrl && profile?.avatarUrl === "");
  useCmsActionToast(state);
  const showEditor = !profile || (editing && !(state.success && state !== editStartedFrom));

  if (profile && !showEditor) {
    return <ProfileView onEdit={() => { setDraft(profileDraft(profile)); setAvatarRemoved(profile.avatarUrl === ""); setEditStartedFrom(state); setEditing(true); }} profile={profile} />;
  }

  return (
    <form action={formAction} className="space-y-8">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-lg font-semibold text-slate-950">{profile ? "Edit profile" : "Create profile"}</h2>
        <p className="mt-1 text-sm text-slate-600">{profile ? "Save your draft, then use the global Preview and Publish changes actions." : "Create your draft profile, then preview and publish it when ready."}</p>
      </div>
      <fieldset className="space-y-8" disabled={pending}>
        <section aria-labelledby="profile-basic-heading" className="space-y-5">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="text-base font-semibold text-slate-950" id="profile-basic-heading">Basic information</h3>
            <p className="mt-1 text-sm text-slate-600">The name and title shown in your portfolio.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className={labelClassName} htmlFor="profile-name">Full name</label>
              <input autoComplete="name" className={fieldClassName} id="profile-name" maxLength={120} name="name" onChange={(event) => setDraft({ ...draft, name: event.target.value })} required type="text" value={draft.name} />
            </div>
            <div className="space-y-1.5">
              <label className={labelClassName} htmlFor="profile-title">Professional title</label>
              <input className={fieldClassName} id="profile-title" maxLength={160} name="title" onChange={(event) => setDraft({ ...draft, title: event.target.value })} required type="text" value={draft.title} />
            </div>
          </div>
        </section>

        <section aria-labelledby="profile-about-heading" className="space-y-5">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="text-base font-semibold text-slate-950" id="profile-about-heading">About</h3>
            <p className="mt-1 text-sm text-slate-600">Leave this empty until your public biography is ready.</p>
          </div>
          <div className="space-y-1.5">
            <label className={labelClassName} htmlFor="profile-bio">About me</label>
            <textarea className={`${fieldClassName} min-h-40 resize-y`} id="profile-bio" maxLength={5000} name="bio" onChange={(event) => setDraft({ ...draft, bio: event.target.value })} value={draft.bio} />
          </div>
        </section>

        <section aria-labelledby="profile-links-heading" className="space-y-5">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="text-base font-semibold text-slate-950" id="profile-links-heading">Optional profile links</h3>
            <p className="mt-1 text-sm text-slate-600">Social and contact links are managed separately in Social Links.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <CmsImageField allowRemove disabled={pending} id="profile-avatar" label="Hero / Profile image" name="avatar_url" onChange={(avatarUrl) => { setAvatarRemoved(false); setDraft((current) => ({ ...current, avatarUrl })); }} onRemove={() => setAvatarRemoved(true)} value={draft.avatarUrl} />
              <input name="avatar_image_removed" type="hidden" value={avatarRemoved ? "1" : "0"} />
            </div>
            <div className="space-y-1.5">
              <label className={labelClassName} htmlFor="profile-resume-url">Résumé URL</label>
              <input className={fieldClassName} id="profile-resume-url" inputMode="url" maxLength={2000} name="resume_url" onChange={(event) => setDraft({ ...draft, resumeUrl: event.target.value })} type="text" value={draft.resumeUrl} />
            </div>
          </div>
        </section>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
        {profile ? <Button disabled={pending} onClick={() => { setDraft(profileDraft(profile)); setEditing(false); }} type="button" variant="outline">Cancel</Button> : null}
        <Button className="bg-slate-900 px-5 text-white hover:bg-slate-700" disabled={pending} type="submit">
          {pending ? "Saving..." : profile ? "Save changes" : "Create profile"}
        </Button>
      </div>
    </form>
  );
}
