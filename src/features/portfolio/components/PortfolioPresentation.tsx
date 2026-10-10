import { existsSync } from "node:fs";
import { join } from "node:path";

import PortfolioHome from "@/features/portfolio/components/PortfolioHome";
import type { PortfolioData } from "@/features/portfolio/data";
import type { PortfolioVariant } from "@/features/portfolio/variants";
import SimplePortfolio from "@/features/simple-portfolio/components/SimplePortfolio";
import { selectFeaturedProjects } from "@/features/website/projects/featured";

export default function PortfolioPresentation({ variant, data }: { variant: PortfolioVariant; data: PortfolioData }) {
  if (variant === "simple") {
    return (
      <SimplePortfolio
        hasPortrait={data.profile?.avatarUrl === "" ? false : Boolean(data.profile?.avatarUrl) || existsSync(join(process.cwd(), "public", "me.png"))}
        profile={data.profile}
        projects={selectFeaturedProjects(data.projects)}
        socialLinks={data.socialLinks}
        experiences={data.experiences}
      />
    );
  }

  return <PortfolioHome profile={data.profile} projects={data.projects} socialLinks={data.socialLinks} experiences={data.experiences} />;
}
