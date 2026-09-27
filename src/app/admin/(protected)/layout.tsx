import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getAdminAccess } from "@/features/cms/auth/service";

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const access = await getAdminAccess();

  if (access.status === "signed_out") {
    redirect("/admin");
  }

  if (access.status === "denied") {
    return <main className="text-center"><h1 className="text-xl font-semibold">Access denied.</h1></main>;
  }

  return children;
}
