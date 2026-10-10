"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";

import Contact from "@/features/portfolio/components/Contact";
import PortfolioHero from "@/features/portfolio/components/PortfolioHero";
import MessageWidget from "@/features/messaging/components/MessageWidget";
import ProfileSection from "@/features/website/profile/components/ProfileSection";
import FeaturedProjectList from "@/features/website/projects/components/FeaturedProjectList";
import type { PublicProfile } from "@/features/website/profile/types";
import ProjectList from "@/features/website/projects/components/ProjectList";
import { getProjectCategory, projectCategories, type ProjectCategory } from "@/features/website/projects/categories";
import { selectFeaturedProjects } from "@/features/website/projects/featured";
import type { PublicProject } from "@/features/website/projects/types";
import type { PublicSocialLink } from "@/features/website/social-links/service";
import type { Experience } from "@/features/experience/types";
import { formatExperienceRange } from "@/features/experience/validation";

type PortfolioSection = "home" | "projects" | "info";
type ActiveNavigation = "projects" | "info" | null;
type PortfolioTheme = "light" | "dark";

interface PortfolioHomeProps {
  profile: PublicProfile | null;
  projects: PublicProject[];
  socialLinks: PublicSocialLink[];
  experiences: Omit<Experience, "sortOrder">[];
}

export default function PortfolioHome({ profile, projects, socialLinks, experiences }: PortfolioHomeProps) {
  const [activeNavigation, setActiveNavigation] = useState<ActiveNavigation>(null);
  const [activeProjectCategory, setActiveProjectCategory] = useState<ProjectCategory>("web-development");
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [theme, setTheme] = useState<PortfolioTheme>("light");
  const [messageOpenRequest, setMessageOpenRequest] = useState(0);

  useEffect(() => {
    const updateActiveNavigation = () => {
      const marker = window.scrollY + window.innerHeight * 0.35;
      const info = document.getElementById("info");
      const projectsSection = document.getElementById("projects");
      setActiveNavigation(
        info && marker >= info.offsetTop ? "info" :
        projectsSection && marker >= projectsSection.offsetTop ? "projects" : null,
      );
    };
    updateActiveNavigation();
    window.addEventListener("scroll", updateActiveNavigation, { passive: true });
    window.addEventListener("resize", updateActiveNavigation);
    return () => {
      window.removeEventListener("scroll", updateActiveNavigation);
      window.removeEventListener("resize", updateActiveNavigation);
    };
  }, []);

  function goTo(section: PortfolioSection) {
    setActiveNavigation(section === "projects" ? "projects" : section === "home" ? null : "info");
    const target = document.getElementById(section);
    if (!target) return;
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  function selectCategory(category: ProjectCategory) {
    setActiveProjectCategory(category);
    goTo("projects");
  }

  function toggleTheme() {
    setTheme((current) => current === "light" ? "dark" : "light");
  }

  const visibleProjects = projects.filter((project) => getProjectCategory(project) === activeProjectCategory);
  const featuredProjects = selectFeaturedProjects(projects);
  const categoryLabel = projectCategories.find((category) => category.id === activeProjectCategory)?.label;

  function switchProjectView(showAll: boolean) {
    setShowAllProjects(showAll);
    goTo("projects");
    window.requestAnimationFrame(() => document.getElementById("projects-title")?.focus({ preventScroll: true }));
  }

  return (
    <div className="portfolio-shell" data-theme={theme}>
      <header className="portfolio-header">
        <div className="portfolio-topbar">
          <button aria-label="Aeron John, back to home" className="portfolio-wordmark" onClick={() => goTo("home")} type="button">AERON JOHN<span aria-hidden="true" className="portfolio-wordmark-dot">.</span></button>
          <div className="portfolio-header-actions">
            <nav aria-label="Primary portfolio navigation" className="portfolio-topnav">
              <button aria-current={activeNavigation === "projects" ? "location" : undefined} className={activeNavigation === "projects" ? "is-active" : ""} onClick={() => goTo("projects")} type="button">PROJECTS</button>
              <button aria-current={activeNavigation === "info" ? "location" : undefined} className={activeNavigation === "info" ? "is-active" : ""} onClick={() => goTo("info")} type="button">INFO</button>
            </nav>
            <button aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"} aria-pressed={theme === "dark"} className="portfolio-theme-toggle" onClick={toggleTheme} title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"} type="button"><span aria-hidden="true" className="portfolio-theme-glyph" /></button>
          </div>
        </div>
      </header>

      <main className="portfolio-main">
        <PortfolioHero onEmail={() => setMessageOpenRequest((request) => request + 1)} profile={profile} socialLinks={socialLinks} />

        <section aria-labelledby="projects-title" className="portfolio-content-section portfolio-projects" id="projects">
          <div className="portfolio-section-heading">
            <div><p className="portfolio-overline">01 / Selected work</p><h2 id="projects-title" tabIndex={-1}>{showAllProjects ? "All projects" : "Featured projects"}<span aria-hidden="true">.</span></h2></div>
            <p>{showAllProjects ? "Work across web development, commerce, and automation." : "A closer look at selected work."}</p>
          </div>
          {showAllProjects ? (
            <div className="portfolio-project-archive">
              <div aria-label="Project category" className="portfolio-category-tabs" role="group">
                {projectCategories.map((category) => <button aria-pressed={activeProjectCategory === category.id} className={activeProjectCategory === category.id ? "is-active" : ""} key={category.id} onClick={() => selectCategory(category.id)} type="button">{category.label}</button>)}
              </div>
              <div aria-live="polite" className="portfolio-project-results">
                <p className="portfolio-project-kicker">{categoryLabel} <span>{String(visibleProjects.length).padStart(2, "0")}</span></p>
                {visibleProjects.length > 0 ? <ProjectList projects={visibleProjects} /> : <p className="portfolio-empty-projects">No {categoryLabel?.toLowerCase()} projects are published yet.</p>}
              </div>
              <button className="portfolio-project-view-all" onClick={() => switchProjectView(false)} type="button">Back to featured projects <ArrowUpRight aria-hidden="true" size={17} /></button>
            </div>
          ) : (
            <div className="portfolio-featured-projects">
              {featuredProjects.length > 0 ? <FeaturedProjectList projects={featuredProjects} /> : <p className="portfolio-empty-projects">No projects are published yet.</p>}
              <button className="portfolio-project-view-all" onClick={() => switchProjectView(true)} type="button">VIEW ALL PROJECTS <ArrowUpRight aria-hidden="true" size={17} /></button>
            </div>
          )}
        </section>

        <section aria-labelledby="info-title" className="portfolio-info" id="info">
          <div className="portfolio-info-intro">
            <div>
              <p className="portfolio-overline">02 / Beyond the build</p>
              <h2 id="info-title">Info<span aria-hidden="true">.</span></h2>
              <p>Background, work notes, and ways to connect.</p>
            </div>
            <button className="portfolio-info-cta" onClick={() => setMessageOpenRequest((request) => request + 1)} type="button">Message Me <ArrowUpRight aria-hidden="true" size={15} /></button>
          </div>

          {experiences.length ? (
            <section aria-labelledby="experience-title" className="portfolio-content-section portfolio-experience" id="experience">
              <p className="portfolio-overline">Work history</p>
              <h2 id="experience-title">Experience<span aria-hidden="true">.</span></h2>
              <ol className="portfolio-experience-list">
                {experiences.map((entry) => (
                  <li key={entry.id}>
                    <article className="portfolio-experience-entry">
                      <p className="portfolio-experience-dates">{formatExperienceRange(entry.startDate, entry.endDate, entry.isCurrent)}</p>
                      <div className="portfolio-experience-copy">
                        <h3>{entry.role}</h3>
                        <p className="portfolio-experience-company">{entry.companyUrl ? <a href={entry.companyUrl} rel="noopener noreferrer" target="_blank" aria-label={`${entry.company} website (opens in a new tab)`}>{entry.company} <ArrowUpRight aria-hidden="true" size={15} /></a> : entry.company}{entry.location ? <span> · {entry.location}</span> : null}</p>
                        <p className="portfolio-experience-description">{entry.description}</p>
                        {entry.technologies.length ? <ul aria-label={`${entry.role} technologies`} className="portfolio-experience-skills">{entry.technologies.map((skill) => <li key={skill}>{skill}</li>)}</ul> : null}
                      </div>
                    </article>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <div className="portfolio-profile"><ProfileSection profile={profile} /></div>
          <div className="portfolio-contact"><Contact links={socialLinks} /></div>

        </section>
      </main>
      <MessageWidget openRequest={messageOpenRequest} />
    </div>
  );
}
