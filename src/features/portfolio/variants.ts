export const portfolioVariants = ["main", "simple"] as const;

export type PortfolioVariant = (typeof portfolioVariants)[number];

export function isPortfolioVariant(value: unknown): value is PortfolioVariant {
  return value === "main" || value === "simple";
}

export function resolvePortfolioVariant(value: unknown): PortfolioVariant {
  return isPortfolioVariant(value) ? value : "main";
}
