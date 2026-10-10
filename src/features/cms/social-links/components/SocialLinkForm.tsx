"use client";

import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useCmsActionToast } from "@/components/admin/CmsToastProvider";
import { createSocialLinkAction, updateSocialLinkAction } from "@/features/cms/social-links/actions";
import {
  detectSocialPlatformFromUrl, getSocialPlatformKey, getSocialPlatformLabel,
  SOCIAL_PLATFORM_OPTIONS, SOCIAL_PLATFORMS, SocialIcon,
} from "@/features/cms/social-links/platforms";
import type { SocialLinkActionState } from "@/features/cms/social-links/types";
import { normalizeSocialUrl } from "@/features/portfolio/urls";
import type { SocialLink } from "@/types/social-link";

interface SocialLinkFormProps {
  socialLink?: SocialLink;
  onCancel?: () => void;
  onSaved?: () => void;
}

const initialState: SocialLinkActionState = { success: false, message: null };
const fieldClassName = "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100";

export default function SocialLinkForm({ socialLink, onCancel, onSaved }: SocialLinkFormProps) {
  const router = useRouter();
  const [platform, setPlatform] = useState<string>(socialLink ? getSocialPlatformKey(socialLink.platform) ?? socialLink.platform : "");
  const [url, setUrl] = useState(socialLink?.url ?? "");
  const [urlTouched, setUrlTouched] = useState(false);
  const [state, formAction, pending] = useActionState(async (previous: SocialLinkActionState, formData: FormData) => {
    const result = socialLink
      ? await updateSocialLinkAction(socialLink.id, previous, formData)
      : await createSocialLinkAction(previous, formData);
    if (result.success && !socialLink) {
      setPlatform("");
      setUrl("");
      setUrlTouched(false);
    }
    if (result.success) router.refresh();
    return result;
  }, initialState);
  useCmsActionToast(state);

  useEffect(() => {
    if (state.success && socialLink) onSaved?.();
  }, [state, socialLink, onSaved]);

  const prefix = socialLink ? `social-${socialLink.id}` : "new-social";
  const knownKey = getSocialPlatformKey(platform);
  const legacyPlatform = socialLink && !getSocialPlatformKey(socialLink.platform) ? socialLink.platform : null;
  const options = legacyPlatform
    ? [{ key: legacyPlatform, label: `${legacyPlatform} (existing)` }, ...SOCIAL_PLATFORM_OPTIONS]
    : SOCIAL_PLATFORM_OPTIONS;
  const platformLabel = platform ? getSocialPlatformLabel(platform) : "";
  const urlError = urlTouched && url && !normalizeSocialUrl(url) ? "Enter a valid URL." : state.fieldErrors?.url;

  return (
    <form action={formAction} className="space-y-5">
      <fieldset className="space-y-5" disabled={pending}>
        <Select.Root items={options.map((option) => ({ value: option.key, label: option.label }))} name="platform" onValueChange={(value) => setPlatform(value ?? "")} required value={platform || null}>
          <Select.Label className="mb-1.5 block text-sm font-medium text-slate-700">Platform</Select.Label>
          <Select.Trigger aria-invalid={Boolean(state.fieldErrors?.platform)} className={`${fieldClassName} flex items-center gap-3 text-left`} id={`${prefix}-platform`}>
            {platform ? <SocialIcon className="shrink-0" platform={platform} size={18} /> : null}
            <Select.Value className="min-w-0 flex-1 truncate" placeholder="Choose a platform" />
            <Select.Icon><ChevronDown aria-hidden="true" className="size-4 text-slate-500" /></Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner alignItemWithTrigger={false} className="z-[1200]" sideOffset={5}>
              <Select.Popup className="max-h-[min(22rem,60vh)] w-[min(23rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-xl outline-none">
                {options.map((option) => (
                  <Select.Item className="flex min-h-10 cursor-pointer items-center gap-3 rounded px-3 text-sm text-slate-800 outline-none data-[highlighted]:bg-slate-100" key={option.key} value={option.key}>
                    <SocialIcon className="shrink-0" platform={option.key} size={17} />
                    <Select.ItemText className="flex-1">{option.label}</Select.ItemText>
                    <Select.ItemIndicator><Check aria-hidden="true" className="size-4" /></Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
        {state.fieldErrors?.platform ? <p className="-mt-3 text-sm text-red-700" role="alert">{state.fieldErrors.platform}</p> : null}

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor={`${prefix}-url`}>URL</label>
          <input
            aria-invalid={Boolean(urlError)}
            className={fieldClassName}
            id={`${prefix}-url`}
            inputMode="url"
            name="url"
            onBlur={() => setUrlTouched(true)}
            onChange={(event) => {
              const next = event.target.value;
              setUrl(next);
              if (!platform) setPlatform(detectSocialPlatformFromUrl(next) ?? "");
            }}
            placeholder={knownKey ? SOCIAL_PLATFORMS[knownKey].placeholder : "https://example.com/username"}
            required
            type="text"
            value={url}
          />
          {urlError ? <p className="text-sm text-red-700" role="alert">{urlError}</p> : null}
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Preview</p>
          <p className="mt-2 flex items-center gap-2.5 text-sm font-semibold text-slate-900">
            {platform ? <SocialIcon platform={platform} size={20} /> : <span aria-hidden="true" className="size-5 rounded-full border border-dashed border-slate-400" />}
            {platformLabel || "Choose a platform"}
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {socialLink && onCancel ? <Button onClick={onCancel} type="button" variant="outline">Cancel</Button> : null}
          <Button className="bg-slate-900 px-4 text-white hover:bg-slate-700" type="submit">
            {pending ? "Saving..." : socialLink ? "Save changes" : "Add social link"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
