import type { DashboardStatsData } from "@/features/cms/dashboard/service";

interface DashboardStatsProps {
  stats: DashboardStatsData;
}

const formatCount = (count: number | null) =>
  count === null ? "Unavailable" : count.toString();

export default function DashboardStats({ stats }: DashboardStatsProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="CMS statistics">
      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-slate-600">Total Projects</h2>
        <p className="mt-2 text-3xl font-semibold text-slate-950">
          {formatCount(stats.totalProjects)}
        </p>
      </article>
      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-slate-600">Total Blog Posts</h2>
        <p className="mt-2 text-3xl font-semibold text-slate-950">
          {formatCount(stats.totalBlogPosts)}
        </p>
      </article>
      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-slate-600">Total Messages</h2>
        <p className="mt-2 text-3xl font-semibold text-slate-950">
          {formatCount(stats.totalMessages)}
        </p>
      </article>
    </section>
  );
}
