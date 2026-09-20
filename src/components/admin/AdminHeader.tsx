"use client";

import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";

const pageTitles: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/dashboard/projects": "Projects",
  "/admin/dashboard/profile": "Profile",
  "/admin/dashboard/social-links": "Social Links",
  "/admin/dashboard/blog": "Blog",
  "/admin/dashboard/messages": "Messages",
  "/admin/dashboard/settings": "Settings",
};

export default function AdminHeader() {
  const pathname = usePathname();

  if (pathname === "/admin/login") {
    return null;
  }

  const pageTitle = pageTitles[pathname] ?? "Admin";

  return (
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Portfolio CMS
        </p>
        <p className="font-semibold text-slate-950">{pageTitle}</p>
      </div>

      <Button disabled title="Logout will be connected later" type="button" variant="outline">
        Log out
      </Button>
    </header>
  );
}
