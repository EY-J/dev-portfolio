import type { Metadata } from "next";

import type { PortfolioData } from "@/features/portfolio/data";

export function portfolioMetadata(data: PortfolioData): Metadata {
  const name = data.profile?.name || "Aeron John";
  const title = data.profile?.title || "Analyst Programmer";

  return {
    title: `${name} | ${title}`,
    description: data.profile?.bio?.trim().slice(0, 160) || `${name}'s portfolio in CMS development, frontend implementation, and web development.`,
  };
}
