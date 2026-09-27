import SocialLinkForm from "@/features/cms/social-links/components/SocialLinkForm";
import SocialLinkTable from "@/features/cms/social-links/components/SocialLinkTable";
import { getSocialLinks } from "@/features/cms/social-links/service";

export default async function SocialLinksPage() {
  const socialLinks = await getSocialLinks();

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Social Links</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage links to your public social profiles.
        </p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">Create social link</h2>
        <SocialLinkForm />
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">Existing social links</h2>
        <SocialLinkTable socialLinks={socialLinks} />
      </section>
    </main>
  );
}
