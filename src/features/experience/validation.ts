import { normalizeHttpUrl } from "@/features/portfolio/urls";
import type { ExperienceActionState, ExperienceInput } from "@/features/experience/types";

const monthPattern = /^(?!0000)(\d{4})-(0[1-9]|1[0-2])$/;

export function formatExperienceMonth(value: string): string {
  if (!monthPattern.test(value)) return value;
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function formatExperienceRange(startDate: string, endDate: string | null, isCurrent: boolean): string {
  return `${formatExperienceMonth(startDate)} — ${isCurrent ? "Present" : endDate ? formatExperienceMonth(endDate) : ""}`;
}

export function parseExperienceInput(formData: FormData):
  | { input: ExperienceInput; error: null }
  | { input: null; error: ExperienceActionState } {
  const read = (key: string) => String(formData.get(key) ?? "").trim();
  const role = read("role");
  const company = read("company");
  const location = read("location");
  const startDate = read("startDate");
  const endDate = read("endDate");
  const isCurrent = formData.get("isCurrent") === "on";
  const description = read("description");
  const companyUrl = read("companyUrl");
  const technologies = read("technologies").split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  const normalizedUrl = companyUrl ? normalizeHttpUrl(companyUrl) : null;
  const fieldErrors: Record<string, string> = {};
  if (!role || role.length > 120) fieldErrors.role = "Enter a role of 1–120 characters.";
  if (!company || company.length > 120) fieldErrors.company = "Enter a company of 1–120 characters.";
  if (location.length > 120) fieldErrors.location = "Keep the location under 120 characters.";
  if (!monthPattern.test(startDate)) fieldErrors.startDate = "Choose a start month and year.";
  if (isCurrent && endDate) fieldErrors.endDate = "A current position cannot have an end date.";
  if (!isCurrent && !monthPattern.test(endDate)) fieldErrors.endDate = "Choose an end month and year.";
  if (!isCurrent && monthPattern.test(startDate) && monthPattern.test(endDate) && endDate < startDate) fieldErrors.endDate = "End date cannot be before start date.";
  if (!description || description.length > 5000) fieldErrors.description = "Enter a description of 1–5000 characters.";
  if (technologies.length > 20 || technologies.some((item) => item.length > 50)) fieldErrors.technologies = "Use up to 20 skills, each 50 characters or fewer.";
  if (companyUrl && (!normalizedUrl || !normalizedUrl.startsWith("https://") || companyUrl.length > 2048)) fieldErrors.companyUrl = "Enter a valid HTTPS URL.";
  if (Object.keys(fieldErrors).length) return { input: null, error: { success: false, message: "Check the highlighted fields.", fieldErrors } };
  return { input: { role, company, location: location || null, startDate, endDate: isCurrent ? null : endDate, isCurrent, description, technologies, companyUrl: normalizedUrl }, error: null };
}
