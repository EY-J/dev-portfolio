import type { Metadata } from "next";

import PortfolioPresentation from "@/features/portfolio/components/PortfolioPresentation";
import { portfolioMetadata } from "@/features/portfolio/metadata";
import { getPublishedSite } from "@/features/portfolio/site-publication";

import "./simple/simple-portfolio.css";

export async function generateMetadata(): Promise<Metadata> {
  const { data } = await getPublishedSite();
  return {
    ...portfolioMetadata(data),
    alternates: { canonical: "/" },
  };
}

export default async function Home() {
  const { data, variant } = await getPublishedSite();

  return <PortfolioPresentation data={data} variant={variant} />;
}
