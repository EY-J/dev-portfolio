import Contact from "@/features/portfolio/components/Contact";
import Hero from "@/features/portfolio/components/Hero";
import InquiryForm from "@/features/messaging/components/InquiryForm";
import ProfileSection from "@/features/website/profile/components/ProfileSection";
import { getPublicProfile } from "@/features/website/profile/service";
import ProjectList from "@/features/website/projects/components/ProjectList";
import { getPublicProjects } from "@/features/website/projects/service";
import { getPublicSocialLinks } from "@/features/website/social-links/service";
import Link from "next/link";

export default async function Home() {
  const [profile, projects, socialLinks] = await Promise.all([
    getPublicProfile().catch(() => null),
    getPublicProjects().catch(() => []),
    getPublicSocialLinks().catch(() => []),
  ]);

  return (
    <main>
      <Hero name={profile?.name} title={profile?.title} />
      <ProfileSection profile={profile} />
      <section className="border-y border-slate-200 bg-slate-50" id="projects">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Projects</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Selected work</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">A closer look at what I&apos;ve built.</p>
          <ProjectList projects={projects} />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6" id="blog">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Blog &amp; work notes</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Writing</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">Notes on projects and the work behind them will appear here.</p>
      </section>
      <Contact links={socialLinks} />
      <section className="border-t border-slate-200 bg-slate-50" id="message-me">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Message Me</p>
            <h2 className="mt-3 max-w-md text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Start a private conversation</h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-600">Have a project, opportunity, or idea to discuss? Start a thread here and continue it through this portfolio. I&apos;ll send an email when I reply.</p>
            <Link className="mt-6 inline-flex text-sm font-medium text-slate-700 underline underline-offset-4 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900" href="/messages">Already have a conversation?</Link>
          </div>
          <InquiryForm />
        </div>
      </section>
    </main>
  );
}
