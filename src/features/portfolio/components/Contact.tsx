import type { PublicSocialLink } from "@/features/website/social-links/service";
import { getSocialPlatformLabel, SocialIcon } from "@/features/cms/social-links/platforms";

export default function Contact({ links }: { links: PublicSocialLink[] }) {
  return (
    <section className="border-t border-slate-200 bg-white" id="contact">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Contact</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Find me elsewhere</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">Public profiles and ways to connect, separate from a private project conversation.</p>
        {links.length > 0 ? (
          <ul className="mt-7 flex flex-wrap gap-3">
            {links.map((link) => (
              <li key={`${link.label}:${link.href}`}>
                <a className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:border-slate-500 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900" href={link.href} rel="noopener noreferrer" target="_blank"><SocialIcon platform={link.label} size={16} />{getSocialPlatformLabel(link.label)}<span className="sr-only"> (opens in a new tab)</span></a>
              </li>
            ))}
          </ul>
        ) : <p className="mt-6 text-sm text-slate-500">Public contact links will appear here when available.</p>}
      </div>
    </section>
  );
}
