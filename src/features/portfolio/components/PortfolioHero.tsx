import Image from "next/image";
import { Mail } from "lucide-react";

import { getSocialPlatformKey, SocialIcon } from "@/features/cms/social-links/platforms";
import type { PublicSocialLink } from "@/features/website/social-links/service";
import type { PublicProfile } from "@/features/website/profile/types";

interface PortfolioHeroProps {
  socialLinks: PublicSocialLink[];
  profile: PublicProfile | null;
  onEmail: () => void;
}

export default function PortfolioHero({ socialLinks, profile, onEmail }: PortfolioHeroProps) {
  const github = socialLinks.find((link) => getSocialPlatformKey(link.label) === "github");
  const linkedin = socialLinks.find((link) => getSocialPlatformKey(link.label) === "linkedin");
  const portrait = profile?.avatarUrl === "" ? null : profile?.avatarUrl || "/me.png";

  return (
    <section aria-labelledby="portfolio-hero-title" className="portfolio-hero" id="home">
      <div className="portfolio-hero-inner">
        <div className="portfolio-hero-role">
          <p>ANALYST PROGRAMMER</p>
          <p>CMS &amp; FRONTEND DEVELOPMENT</p>
        </div>

        <div className="portfolio-hero-composition">
          <div className="portfolio-hero-name-layer">
            <p className="portfolio-hero-greeting">Hey I’m</p>
            <h1 id="portfolio-hero-title">AERON JOHN.</h1>
          </div>
          {portrait ? <Image
            alt={profile?.avatarAlt ?? profile?.name ?? "Aeron John"}
            className="portfolio-hero-person"
            height={1267}
            priority
            sizes="(max-width: 700px) 88vw, (max-width: 1000px) 45vw, 570px"
            src={portrait}
            unoptimized={portrait.startsWith("/api/cms/media/") || /^https?:\/\//.test(portrait)}
            width={1241}
          /> : null}
        </div>

        <nav aria-label="Social links" className="portfolio-hero-socials">
          {github && <a aria-label="GitHub" href={github.href} rel="noopener noreferrer" target="_blank" title="GitHub"><SocialIcon platform="github" size={19} /><span>GitHub</span></a>}
          {linkedin && <a aria-label="LinkedIn" href={linkedin.href} rel="noopener noreferrer" target="_blank" title="LinkedIn"><SocialIcon platform="linkedin" size={19} /><span>LinkedIn</span></a>}
          <button aria-label="Email Aeron" onClick={onEmail} title="Email Aeron" type="button"><Mail aria-hidden="true" size={19} /><span>Email</span></button>
        </nav>
      </div>
    </section>
  );
}
