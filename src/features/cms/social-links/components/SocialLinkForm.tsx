"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  createSocialLinkAction,
  updateSocialLinkAction,
} from "@/features/cms/social-links/actions";
import type { SocialLinkActionState } from "@/features/cms/social-links/types";
import type { SocialLink } from "@/types/social-link";

interface SocialLinkFormProps {
  socialLink?: SocialLink;
}

const initialState: SocialLinkActionState = {
  success: false,
  message: null,
};

const fieldClassName =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100";
const labelClassName = "block text-sm font-medium text-slate-700";

export default function SocialLinkForm({ socialLink }: SocialLinkFormProps) {
  const action = socialLink
    ? updateSocialLinkAction.bind(null, socialLink.id)
    : createSocialLinkAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const prefix = socialLink ? `social-${socialLink.id}` : "new-social";

  return (
    <form className="space-y-4" action={formAction}>
      <fieldset className="grid gap-5" disabled={pending}>
        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor={`${prefix}-platform`}>Platform</label>
          <input
            className={fieldClassName}
            defaultValue={socialLink?.platform}
            id={`${prefix}-platform`}
            name="platform"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor={`${prefix}-url`}>URL</label>
          <input
            className={fieldClassName}
            defaultValue={socialLink?.url}
            id={`${prefix}-url`}
            name="url"
            required
            type="url"
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor={`${prefix}-icon`}>Icon</label>
          <input
            className={fieldClassName}
            defaultValue={socialLink?.icon}
            id={`${prefix}-icon`}
            name="icon"
            required
          />
        </div>
        <Button className="w-fit bg-slate-900 px-4 text-white hover:bg-slate-700" type="submit">
          {pending
            ? "Saving..."
            : socialLink
              ? "Save changes"
              : "Create social link"}
        </Button>
      </fieldset>
      {state.message ? (
        <p className={state.success ? "text-sm text-emerald-700" : "text-sm text-red-600"} aria-live="polite" role={state.success ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
