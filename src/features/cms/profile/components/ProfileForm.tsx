"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { updateProfileAction } from "@/features/cms/profile/actions";
import type { ProfileActionState } from "@/features/cms/profile/types";
import type { Profile } from "@/types/profile";

interface ProfileFormProps {
  profile: Profile;
}

const initialState: ProfileActionState = {
  success: false,
  message: null,
};

const fieldClassName =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100";
const labelClassName = "block text-sm font-medium text-slate-700";

export default function ProfileForm({ profile }: ProfileFormProps) {
  const action = updateProfileAction.bind(null, profile.id);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form className="space-y-4" action={formAction}>
      <fieldset className="grid gap-5" disabled={pending}>
        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor="profile-name">Name</label>
          <input className={fieldClassName} defaultValue={profile.name} id="profile-name" name="name" required />
        </div>
        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor="profile-title">Title</label>
          <input className={fieldClassName} defaultValue={profile.title} id="profile-title" name="title" required />
        </div>
        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor="profile-bio">Bio</label>
          <textarea className={`${fieldClassName} min-h-36 resize-y`} defaultValue={profile.bio} id="profile-bio" name="bio" required />
        </div>
        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor="profile-avatar-url">Avatar URL</label>
          <input
            className={fieldClassName}
            defaultValue={profile.avatarUrl}
            id="profile-avatar-url"
            name="avatar_url"
            type="url"
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor="profile-resume-url">Resume URL</label>
          <input
            className={fieldClassName}
            defaultValue={profile.resumeUrl}
            id="profile-resume-url"
            name="resume_url"
            type="url"
          />
        </div>
        <Button className="w-fit bg-slate-900 px-4 text-white hover:bg-slate-700" type="submit">{pending ? "Saving..." : "Save profile"}</Button>
      </fieldset>
      {state.message ? (
        <p className={state.success ? "text-sm text-emerald-700" : "text-sm text-red-600"} aria-live="polite" role={state.success ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
