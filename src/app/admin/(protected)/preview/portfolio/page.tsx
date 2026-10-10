import { redirect } from "next/navigation";

// Old variant-specific links lead to the single global draft preview.
export default function LegacyPortfolioPreviewPage() {
  redirect("/authpreview");
}
