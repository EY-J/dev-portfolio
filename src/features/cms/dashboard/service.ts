import "server-only";

import { createAuthorizedCmsClient } from "@/features/cms/auth/service";

export interface DashboardStatsData {
  totalProjects: number | null;
  totalExperiences: number | null;
  totalMessages: number | null;
}

async function getTableCount(table: string): Promise<number | null> {
  const supabase = await createAuthorizedCmsClient();
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  return error ? null : count;
}

export async function getDashboardStats(): Promise<DashboardStatsData> {
  const [totalProjects, totalExperiences, totalMessages] = await Promise.all([
    getTableCount("projects"),
    getTableCount("experiences"),
    getTableCount("conversations"),
  ]);

  return { totalProjects, totalExperiences, totalMessages };
}
