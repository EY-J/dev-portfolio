import "server-only";

import { createAuthorizedCmsClient, requireAdmin } from "@/features/cms/auth/service";
import type { Experience, ExperienceInput } from "@/features/experience/types";
import { createAdminClient } from "@/lib/supabase/admin";

const columns = "id, role, company, location, start_date, end_date, is_current, description, technologies, company_url, sort_order";

interface ExperienceRow {
  id: string; role: string; company: string; location: string | null;
  start_date: string; end_date: string | null; is_current: boolean;
  description: string; technologies: string[]; company_url: string | null; sort_order: number;
}

function mapRow(row: ExperienceRow): Experience {
  return { id: row.id, role: row.role, company: row.company, location: row.location,
    startDate: row.start_date.slice(0, 7), endDate: row.end_date?.slice(0, 7) ?? null,
    isCurrent: row.is_current, description: row.description, technologies: row.technologies,
    companyUrl: row.company_url, sortOrder: Number(row.sort_order) };
}

function toRow(input: ExperienceInput) {
  return { role: input.role, company: input.company, location: input.location,
    start_date: `${input.startDate}-01`, end_date: input.endDate ? `${input.endDate}-01` : null,
    is_current: input.isCurrent, description: input.description, technologies: input.technologies,
    company_url: input.companyUrl };
}

export async function getExperiences(): Promise<Experience[]> {
  await requireAdmin();
  const client = createAdminClient();
  const { data, error } = await client.from("experiences").select(columns)
    .order("sort_order", { ascending: true }).order("is_current", { ascending: false })
    .order("start_date", { ascending: false }).order("id", { ascending: true });
  if (error) throw new Error("Unable to load experience.");
  return ((data ?? []) as ExperienceRow[]).map(mapRow);
}

export async function createExperience(input: ExperienceInput): Promise<Experience> {
  await createAuthorizedCmsClient({ requireSitePublication: true });
  const client = createAdminClient();
  // Date-based initial positions make a newly entered older job land after a
  // newer/current one. The editor can still move any entry explicitly.
  const sortOrder = -Number(input.startDate.replace("-", "")) - (input.isCurrent ? 1000000 : 0);
  const { data, error } = await client.from("experiences").insert({ ...toRow(input), sort_order: sortOrder }).select(columns).single();
  if (error || !data) throw new Error("Unable to save experience.");
  return mapRow(data as ExperienceRow);
}

export async function updateExperience(id: string, input: ExperienceInput): Promise<Experience> {
  await createAuthorizedCmsClient({ requireSitePublication: true });
  const client = createAdminClient();
  const { data, error } = await client.from("experiences").update({ ...toRow(input), updated_at: new Date().toISOString() }).eq("id", id).select(columns).single();
  if (error || !data) throw new Error("Unable to update experience.");
  return mapRow(data as ExperienceRow);
}

export async function deleteExperience(id: string): Promise<void> {
  await createAuthorizedCmsClient({ requireSitePublication: true });
  const client = createAdminClient();
  const { data, error } = await client.from("experiences").delete().eq("id", id).select("id").single();
  if (error || !data) throw new Error("Unable to delete experience.");
}

export async function moveExperience(id: string, direction: "up" | "down"): Promise<void> {
  await createAuthorizedCmsClient({ requireSitePublication: true });
  const entries = await getExperiences();
  const index = entries.findIndex((entry) => entry.id === id);
  const neighborIndex = index + (direction === "up" ? -1 : 1);
  if (index < 0 || neighborIndex < 0 || neighborIndex >= entries.length) throw new Error("Unable to reorder experience.");
  // One row update keeps the draft valid if a write fails. Fractional numeric
  // positions allow repeated adjacent moves without rewriting other entries.
  const before = direction === "up" ? entries[neighborIndex - 1] : entries[neighborIndex];
  const after = direction === "up" ? entries[neighborIndex] : entries[neighborIndex + 1];
  const sortOrder = before && after ? (before.sortOrder + after.sortOrder) / 2
    : before ? before.sortOrder + 1024 : after.sortOrder - 1024;
  const { data, error } = await createAdminClient().from("experiences").update({ sort_order: sortOrder, updated_at: new Date().toISOString() }).eq("id", id).select("id").single();
  if (error || !data) throw new Error("Unable to reorder experience.");
}
