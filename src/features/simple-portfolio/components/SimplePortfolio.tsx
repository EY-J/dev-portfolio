import Image from "next/image";

import { SimpleMessageButton, SimpleMessageWidget } from "@/features/simple-portfolio/components/SimpleMessage";
import SimpleProjects from "@/features/simple-portfolio/components/SimpleProjects";
import type { PublicProfile } from "@/features/website/profile/types";
import type { PublicProject } from "@/features/website/projects/types";
import type { PublicSocialLink } from "@/features/website/social-links/service";
import { getSocialPlatformKey, getSocialPlatformLabel, SocialIcon } from "@/features/cms/social-links/platforms";
import type { Experience } from "@/features/experience/types";
import { formatExperienceRange } from "@/features/experience/validation";
import { normalizeAssetUrl } from "@/features/portfolio/urls";

interface SimplePortfolioProps {
  hasPortrait: boolean;
  profile: PublicProfile | null;
  projects: PublicProject[];
  socialLinks: PublicSocialLink[];
  experiences: Omit<Experience, "sortOrder">[];
}

export default function SimplePortfolio({ hasPortrait, profile, projects, socialLinks, experiences }: SimplePortfolioProps) {
  const name = profile?.name?.trim() || "Aeron John";
  const bio = profile?.bio?.trim() || "My work centers on CMS development, frontend implementation, and practical web experiences. I am building broader experience across web development and automation.";
  const resumeUrl = normalizeAssetUrl(profile?.resumeUrl);
  const portrait = profile?.avatarUrl || "/me.png";
  const footerLinks = socialLinks.filter((link) => ["github", "linkedin"].includes(getSocialPlatformKey(link.label) ?? ""));
  const seenTechnologies = new Set<string>();
  const technologies = projects.flatMap((project) => project.technologies).map((value) => value.trim()).filter((value) => {
    const key = value.toLowerCase();
    if (!key || seenTechnologies.has(key)) return false;
    seenTechnologies.add(key);
    return true;
  });
  const hasStack = technologies.length > 0;
  const currentRole = experiences.find((entry) => entry.isCurrent)?.role ?? "Analyst Programmer";

  return (
    <div className="simple-portfolio">
      <header className="simple-header simple-container">
        <a aria-label={`${name}, back to top`} className="simple-wordmark" href="#top">{name}<span aria-hidden="true">.</span></a>
        <nav aria-label="Portfolio navigation">
          <a href="#about">About</a>
          <a href="#projects">Projects</a>
          {experiences.length ? <a href="#experience">Experience</a> : null}
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <main className="simple-container" id="top">
        <section aria-labelledby="simple-hero-heading" className={`simple-hero${hasPortrait ? " simple-hero--with-portrait" : ""}`}>
          <div className="simple-hero-copy">
            <p className="simple-kicker">Hello, I&apos;m</p>
            <h1 id="simple-hero-heading">{name}<span aria-hidden="true">.</span></h1>
            <p className="simple-hero-role">{currentRole}</p>
            <p className="simple-hero-focus">CMS &amp; Frontend Development</p>
            <p className="simple-hero-summary">I build and maintain web experiences with a focus on CMS development, frontend implementation, and useful solutions.</p>
            <div className="simple-hero-actions">
              <a className="simple-button simple-button-primary" href="#projects">View projects <span aria-hidden="true">&#8599;</span></a>
              <a className="simple-button simple-button-text" href="#contact">Get in touch <span aria-hidden="true">&#8599;</span></a>
            </div>
            {socialLinks.length > 0 ? (
              <nav aria-label="Social links" className="simple-hero-socials">
                {socialLinks.slice(0, 3).map((link) => <a href={link.href} key={`${link.label}-${link.href}`} rel="noopener noreferrer" target="_blank"><SocialIcon platform={link.label} size={14} />{getSocialPlatformLabel(link.label)}<span className="sr-only"> (opens in a new tab)</span></a>)}
              </nav>
            ) : null}
          </div>
          {hasPortrait ? (
            <div className="simple-portrait">
              <Image alt={profile?.avatarAlt ?? `Portrait of ${name}`} className="simple-portrait-image" height={1267} priority sizes="(max-width: 760px) 90vw, 38vw" src={portrait} unoptimized={portrait.startsWith("/api/cms/media/") || /^https?:\/\//.test(portrait)} width={1241} />
            </div>
          ) : null}
        </section>

        <section aria-labelledby="simple-about-heading" className="simple-section simple-split" id="about">
          <p className="simple-section-label">01 / About</p>
          <div className="simple-section-content">
            <h2 id="simple-about-heading">A little about me<span aria-hidden="true">.</span></h2>
            <p className="simple-about-copy">{bio}</p>
            <p className="simple-about-detail"><span>Current role</span> {currentRole} <span className="simple-detail-divider" aria-hidden="true">/</span> CMS &amp; Frontend Development</p>
          </div>
        </section>

        {hasStack ? (
          <section aria-labelledby="simple-stack-heading" className="simple-section simple-split" id="stack">
            <p className="simple-section-label">02 / Stack</p>
            <div className="simple-section-content">
              <h2 id="simple-stack-heading">Tools in the work<span aria-hidden="true">.</span></h2>
              <p className="simple-section-intro">Technologies used across the selected projects below.</p>
              <ul aria-label="Technologies used in selected projects" className="simple-stack-list">
                {technologies.map((technology) => <li key={technology.toLowerCase()}>{technology}</li>)}
              </ul>
            </div>
          </section>
        ) : null}

        <SimpleProjects number={hasStack ? "03" : "02"} projects={projects} />

        {experiences.length > 0 ? (
          <section aria-labelledby="simple-experience-heading" className="simple-section simple-split" id="experience">
            <p className="simple-section-label">{hasStack ? "04" : "03"} / Experience</p>
            <div className="simple-section-content">
              <h2 id="simple-experience-heading">Experience<span aria-hidden="true">.</span></h2>
              <ol className="simple-experience-list">{experiences.map((entry) => (
                <li key={entry.id}><article>
                  <h3>{entry.role}</h3>
                  <p className="simple-experience-company">{entry.companyUrl ? <a aria-label={`${entry.company} website (opens in a new tab)`} href={entry.companyUrl} rel="noopener noreferrer" target="_blank">{entry.company} &#8599;</a> : entry.company}{entry.location ? ` · ${entry.location}` : ""}</p>
                  <p className="simple-experience-dates">{formatExperienceRange(entry.startDate, entry.endDate, entry.isCurrent)}</p>
                  <p className="simple-experience-description">{entry.description}</p>
                  {entry.technologies.length ? <p className="simple-experience-skills">{entry.technologies.join(" · ")}</p> : null}
                </article></li>
              ))}</ol>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="simple-contact-heading" className="simple-section simple-split simple-contact" id="contact">
          <p className="simple-section-label">{String((hasStack ? 4 : 3) + (experiences.length ? 1 : 0)).padStart(2, "0")} / Contact</p>
          <div className="simple-section-content">
            <h2 id="simple-contact-heading">Let&apos;s work together<span aria-hidden="true">.</span></h2>
            <p className="simple-section-intro">Have a project, collaboration, or opportunity in mind? Send me a message and let&apos;s talk.</p>
            <SimpleMessageButton className="simple-button simple-button-primary">Message me <span aria-hidden="true">&#8599;</span></SimpleMessageButton>
            {socialLinks.length > 0 || resumeUrl ? (
              <nav aria-label="Contact links" className="simple-contact-links">
                {socialLinks.map((link) => <a href={link.href} key={`${link.label}-${link.href}`} rel="noopener noreferrer" target="_blank"><span className="simple-social-label"><SocialIcon platform={link.label} size={15} />{getSocialPlatformLabel(link.label)}</span><span aria-hidden="true">&#8599;</span><span className="sr-only"> (opens in a new tab)</span></a>)}
                {resumeUrl ? <a href={resumeUrl} rel="noopener noreferrer" target="_blank">R&eacute;sum&eacute;<span aria-hidden="true">&#8599;</span><span className="sr-only"> (opens in a new tab)</span></a> : null}
              </nav>
            ) : null}
          </div>
        </section>
      </main>

      <footer className="simple-footer simple-container">
        <span className="simple-wordmark">{name}<span aria-hidden="true">.</span></span>
        <span>&copy; {new Date().getFullYear()} {name}</span>
        {footerLinks.length > 0 ? <nav aria-label="Footer social links">{footerLinks.map((link) => <a href={link.href} key={link.href} rel="noopener noreferrer" target="_blank"><SocialIcon platform={link.label} size={14} />{getSocialPlatformLabel(link.label)}<span className="sr-only"> (opens in a new tab)</span></a>)}</nav> : null}
      </footer>
      <SimpleMessageWidget />
    </div>
  );
}
