"use client";

import { useActionState } from "react";

import { useCmsActionToast } from "@/components/admin/CmsToastProvider";
import { saveDraftPortfolioVariant, type PortfolioVariantActionState } from "@/features/cms/portfolio-appearance/actions";
import type { PortfolioVariant } from "@/features/portfolio/variants";

const initialState: PortfolioVariantActionState = { status: "idle", variant: null, message: null };

const options: { variant: PortfolioVariant; title: string; description: string }[] = [
  { variant: "main", title: "Main Portfolio", description: "Your custom interactive portfolio." },
  { variant: "simple", title: "Simple Portfolio", description: "Your minimal professional portfolio." },
];

export default function PortfolioAppearance({ activeVariant, publishedVariant, available }: { activeVariant: PortfolioVariant; publishedVariant: PortfolioVariant | null; available: boolean }) {
  const [state, action, pending] = useActionState(saveDraftPortfolioVariant, initialState);
  useCmsActionToast(state);
  const currentVariant = state.variant ?? activeVariant;

  return (
    <section aria-labelledby="portfolio-appearance-title" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-950" id="portfolio-appearance-title">Portfolio Appearance</h2>
          <p className="mt-1 text-sm text-slate-600">Choose the version to preview and include in the next publication.</p>
        </div>
        <div className="space-y-1 text-right text-sm text-slate-700">
          <p>Draft: <strong>{currentVariant === "main" ? "Main Portfolio" : "Simple Portfolio"}</strong></p>
          <p>Published: <strong>{publishedVariant === "main" ? "Main Portfolio" : publishedVariant === "simple" ? "Simple Portfolio" : "Unavailable"}</strong></p>
        </div>
      </div>

      {!available ? (
        <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">
          Draft selection is unavailable until the portfolio settings and site publication migrations are applied.
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {options.map(({ variant, title, description }) => {
          const isSelected = currentVariant === variant;
          return (
            <article className="rounded-lg border border-slate-200 p-5" key={variant}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{description}</p>
                </div>
                {isSelected ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">DRAFT SELECTION</span> : null}
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <form action={action}>
                  <input name="variant" type="hidden" value={variant} />
                  <button className="inline-flex min-h-10 items-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700" disabled={!available || pending || isSelected} type="submit">
                    {isSelected ? "Selected for draft" : pending ? "Saving..." : "Use in draft"}
                  </button>
                </form>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
