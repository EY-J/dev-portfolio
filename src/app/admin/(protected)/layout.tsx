import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getAdminAccess } from "@/features/cms/auth/service";

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const access = await getAdminAccess();

  if (access.status !== "allowed") redirect("/admin");

  return children;
}
