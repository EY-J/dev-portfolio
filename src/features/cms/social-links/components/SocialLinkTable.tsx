"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useCmsToast } from "@/components/admin/CmsToastProvider";
import { Button } from "@/components/ui/button";
import { deleteSocialLinkAction } from "@/features/cms/social-links/actions";
import SocialLinkForm from "@/features/cms/social-links/components/SocialLinkForm";
import { getSocialPlatformLabel, SocialIcon } from "@/features/cms/social-links/platforms";
import { normalizeSocialUrl } from "@/features/portfolio/urls";
import type { SocialLink } from "@/types/social-link";

export default function SocialLinkTable({ socialLinks }: { socialLinks: SocialLink[] }) {
  const router = useRouter();
  const notify = useCmsToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SocialLink | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      try {
        const result = await deleteSocialLinkAction(deleting.id);
        if (!result.success) {
          notify("error", result.message ?? "Unable to delete social link.");
          return;
        }
        notify("success", result.message ?? "Social link deleted.");
        setDeleting(null);
        router.refresh();
      } catch {
        notify("error", "Unable to delete social link.");
      }
    });
  }

  return (
    <>
      {socialLinks.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-5 py-8">
          <p className="font-medium text-slate-900">No social links yet.</p>
          <p className="mt-1 text-sm text-slate-600">Add links such as GitHub or LinkedIn to display them on your portfolio.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200">
          {socialLinks.map((socialLink) => {
            const label = getSocialPlatformLabel(socialLink.platform);
            const href = normalizeSocialUrl(socialLink.url);
            const editing = editingId === socialLink.id;
            return (
              <li className="py-5 first:pt-0 last:pb-0" key={socialLink.id}>
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-800">
                      <SocialIcon platform={socialLink.platform} size={19} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{label}</p>
                      {href ? (
                        <a className="mt-0.5 block break-all text-sm text-slate-600 underline-offset-2 hover:underline" href={href} rel="noopener noreferrer" target="_blank">{socialLink.url}<span className="sr-only"> (opens in a new tab)</span></a>
                      ) : <p className="mt-0.5 break-all text-sm text-slate-600">{socialLink.url}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button aria-expanded={editing} onClick={() => setEditingId(editing ? null : socialLink.id)} type="button" variant="outline">{editing ? "Close" : "Edit"}</Button>
                    <Button disabled={pending} onClick={() => setDeleting(socialLink)} type="button" variant="destructive">Delete</Button>
                  </div>
                </div>
                {editing ? (
                  <div className="mt-5 max-w-2xl rounded-md border border-slate-200 bg-slate-50 p-4 sm:p-5">
                    <h3 className="mb-4 font-semibold text-slate-900">Edit {label}</h3>
                    <SocialLinkForm onCancel={() => setEditingId(null)} onSaved={() => setEditingId(null)} socialLink={socialLink} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog.Root onOpenChange={(open) => { if (!open && !pending) setDeleting(null); }} open={Boolean(deleting)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[1100] bg-slate-950/45" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-[1101] w-[min(25rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-6 text-slate-950 shadow-xl">
            <Dialog.Title className="text-lg font-semibold">Delete {deleting ? getSocialPlatformLabel(deleting.platform) : "social"} link?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-slate-600">This removes it from your draft portfolio.</Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close className="inline-flex min-h-9 items-center rounded-md border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50" disabled={pending} type="button">Cancel</Dialog.Close>
              <Button disabled={pending} onClick={handleDelete} type="button" variant="destructive">{pending ? "Deleting..." : "Delete"}</Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
