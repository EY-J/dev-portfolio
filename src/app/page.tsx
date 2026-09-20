import Contact from "@/features/portfolio/components/Contact";
import Hero from "@/features/portfolio/components/Hero";
import Skills from "@/features/portfolio/components/Skills";
import ProfileSection from "@/features/website/profile/components/ProfileSection";
import { getPublicProfile } from "@/features/website/profile/service";
import ProjectList from "@/features/website/projects/components/ProjectList";
import { getPublicProjects } from "@/features/website/projects/service";

export default async function Home() {
  const [profile, projects] = await Promise.all([
    getPublicProfile(),
    getPublicProjects(),
  ]);

  return (
    <main>
      <Hero />
      <ProfileSection profile={profile} />
      <Skills />
      <section id="projects">
        <h2>Featured Projects</h2>
        <ProjectList projects={projects.slice(0, 3)} />
      </section>
      <Contact />
    </main>
  );
}
