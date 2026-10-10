import "server-only";

import type { PublicProfile } from "@/features/website/profile/types";
import { getPublishedSite, type PublicBlogPost } from "@/features/portfolio/site-publication";
import type { PublicProject } from "@/features/website/projects/types";
import type { PublicSocialLink } from "@/features/website/social-links/service";
import type { Experience } from "@/features/experience/types";

export interface PortfolioData {
  profile: PublicProfile | null;
  projects: PublicProject[];
  socialLinks: PublicSocialLink[];
  blogPosts: PublicBlogPost[];
  experiences: Omit<Experience, "sortOrder">[];
}

export async function getPortfolioData(): Promise<PortfolioData> {
  return (await getPublishedSite()).data;
}
