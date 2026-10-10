"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useActionState, useState } from "react";
import { usePathname } from "next/navigation";

import { useCmsActionToast } from "@/components/admin/CmsToastProvider";
import { Button } from "@/components/ui/button";
import { logout, type LogoutActionState } from "@/features/cms/auth/logout";
import { publishChangesAction, type PublishActionState } from "@/features/cms/publication/actions";
import type { SitePublicationStatus } from "@/features/portfolio/site-publication";

const initialLogoutState: LogoutActionState = { error: null };
const initialPublishState: PublishActionState = { success: false, message: null };

const pageTitles: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/projects": "Projects",
  "/admin/profile": "Profile",
  "/admin/social-links": "Social Links",
  "/admin/experience": "Experience",
  "/admin/media": "Media",
  "/admin/messages": "Messages",
  "/admin/settings": "Settings",
};

export default function AdminHeader({ publicationStatus }: { publicationStatus: SitePublicationStatus }) {
  const pathname = usePathname();
  const [logoutState, logoutAction, logoutPending] = useActionState(
    logout,
    initialLogoutState
  );
  const [publishState, publishAction, publishPending] = useActionState(publishChangesAction, initialPublishState);
  const [requestedOpen, setRequestedOpen] = useState(false);
  const [openedFrom, setOpenedFrom] = useState(publishState);
  const confirmOpen = requestedOpen && !(publishState.success && publishState !== openedFrom);
  useCmsActionToast(publishState);

  const pageTitle = pageTitles[pathname] ?? "Admin";

  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Portfolio CMS
        </p>
        <p className="font-heading font-semibold text-slate-950">{pageTitle}</p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {publicationStatus.available ? (
          <>
            <span className="text-xs font-medium text-slate-600" role="status">
              {publicationStatus.hasUnpublishedChanges ? "● Unpublished changes" : "Up to date"}
            </span>
            <a className="inline-flex min-h-9 items-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950" href="/authpreview" rel="noopener noreferrer" target="_blank">Preview<span className="sr-only"> (opens in a new tab)</span></a>
            <Dialog.Root onOpenChange={(open) => { setRequestedOpen(open); if (open) setOpenedFrom(publishState); }} open={confirmOpen}>
              <Dialog.Trigger className="inline-flex min-h-9 items-center rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!publicationStatus.hasUnpublishedChanges || publishPending}>Publish changes</Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-[1100] bg-slate-950/45" />
                <Dialog.Popup className="fixed left-1/2 top-1/2 z-[1101] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-6 text-slate-950 shadow-xl">
                  <Dialog.Title className="text-lg font-semibold">Publish changes?</Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm leading-6 text-slate-600">This will update the public portfolio with your current draft.</Dialog.Description>
                  <form action={publishAction} className="mt-6 flex justify-end gap-3">
                    <Dialog.Close className="inline-flex min-h-9 items-center rounded-md border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50" disabled={publishPending} type="button">Cancel</Dialog.Close>
                    <Button disabled={publishPending} type="submit">{publishPending ? "Publishing..." : "Publish"}</Button>
                  </form>
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
          </>
        ) : <span className="text-xs text-slate-500">Publishing unavailable</span>}
        <form action={logoutAction}>
          <Button disabled={logoutPending} type="submit" variant="outline">
            {logoutPending ? "Logging out..." : "Log out"}
          </Button>
          {logoutState.error ? (
            <p className="mt-1 text-sm text-red-600" role="alert">
              {logoutState.error}
            </p>
          ) : null}
        </form>
      </div>
    </header>
  );
}
