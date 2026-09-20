import DashboardStats from "@/features/cms/dashboard/components/DashboardStats";
import { getDashboardStats } from "@/features/cms/dashboard/service";

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          A quick overview of your portfolio content.
        </p>
      </div>
      <DashboardStats stats={stats} />
    </main>
  );
}
