import PortfolioAppearance from "@/features/cms/portfolio-appearance/components/PortfolioAppearance";
import { getSitePublicationStatus } from "@/features/portfolio/site-publication";
import { getStoredPortfolioVariant } from "@/features/portfolio/variant-service";

export default async function SettingsPage() {
  const [storedVariant, status] = await Promise.all([
    getStoredPortfolioVariant().catch(() => null),
    getSitePublicationStatus().catch(() => null),
  ]);

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Choose the presentation for your draft. Publish changes when you are ready to update the public site.
        </p>
      </div>
      <PortfolioAppearance activeVariant={storedVariant ?? "main"} publishedVariant={status?.available ? status.publishedVariant : null} available={storedVariant !== null && status?.available === true} />
    </main>
  );
}
