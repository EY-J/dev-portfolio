import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/features/cms/auth/service";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/admin/login");
  }

  return children;
}
