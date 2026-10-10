import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAdminAccess } from "@/features/cms/auth/service";
import PortfolioPresentation from "@/features/portfolio/components/PortfolioPresentation";
import { portfolioMetadata } from "@/features/portfolio/metadata";
import { getDraftSite } from "@/features/portfolio/site-publication";

import "@/app/simple/simple-portfolio.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const robots = { index: false, follow: false };
  const access = await getAdminAccess();
  if (access.status !== "allowed") return { robots };

  try {
    const { data } = await getDraftSite();
    return { ...portfolioMetadata(data), robots };
  } catch {
    return { robots };
  }
}

export default async function AuthPreviewPage() {
  const access = await getAdminAccess();
  if (access.status !== "allowed") redirect("/admin");

  let site;
  try {
    site = await getDraftSite();
  } catch {
    return <main className="p-8"><h1 className="text-xl font-semibold">Preview unavailable</h1><p className="mt-2">Check the site publication setup and try again.</p></main>;
  }

  return <PortfolioPresentation data={site.data} variant={site.variant} />;
}
