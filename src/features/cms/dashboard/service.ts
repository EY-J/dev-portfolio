import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface DashboardStatsData {
  totalProjects: number | null;
  totalBlogPosts: number | null;
  totalMessages: number | null;
}

async function getTableCount(table: string): Promise<number | null> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  return error ? null : count;
}

export async function getDashboardStats(): Promise<DashboardStatsData> {
  const [totalProjects, totalBlogPosts, totalMessages] = await Promise.all([
    getTableCount("projects"),
    getTableCount("blog_posts"),
    getTableCount("messages"),
  ]);

  return { totalProjects, totalBlogPosts, totalMessages };
}
