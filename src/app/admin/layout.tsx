import type { ReactNode } from "react";

import AdminHeader from "@/components/admin/AdminHeader";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { getAdminAccess } from "@/features/cms/auth/service";

export default async function AdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const access = await getAdminAccess();

  if (access.status !== "allowed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#151922] p-4 text-white sm:p-6">
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950 md:flex-row">
      <AdminSidebar />
      <div className="min-w-0 flex-1">
        <AdminHeader />
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}
