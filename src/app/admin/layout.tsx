import type { ReactNode } from "react";

import AdminHeader from "@/components/admin/AdminHeader";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
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
