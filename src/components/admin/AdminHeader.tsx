"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { logout, type LogoutActionState } from "@/features/cms/auth/logout";

const initialLogoutState: LogoutActionState = { error: null };

const pageTitles: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/projects": "Projects",
  "/admin/profile": "Profile",
  "/admin/social-links": "Social Links",
  "/admin/blog": "Blog",
  "/admin/messages": "Messages",
  "/admin/settings": "Settings",
};

export default function AdminHeader() {
  const pathname = usePathname();
  const [logoutState, logoutAction, logoutPending] = useActionState(
    logout,
    initialLogoutState
  );

  const pageTitle = pageTitles[pathname] ?? "Admin";

  return (
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Portfolio CMS
        </p>
        <p className="font-heading font-semibold text-slate-950">{pageTitle}</p>
      </div>

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
    </header>
  );
}
