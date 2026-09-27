import LoginForm from "@/features/cms/auth/components/LoginForm";
import { getAdminAccess } from "@/features/cms/auth/service";
import DashboardStats from "@/features/cms/dashboard/components/DashboardStats";
import { getDashboardStats } from "@/features/cms/dashboard/service";

export default async function AdminPage() {
  const access = await getAdminAccess();

  if (access.status === "denied") {
    return <main className="text-center"><h1 className="text-xl font-semibold">Access denied.</h1></main>;
  }

  if (access.status === "signed_out") {
    return (
      <main className="w-full max-w-sm">
        <section className="rounded-2xl border border-white/10 bg-[#1b202b]/95 p-7 shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur sm:p-8">
          <div className="mb-6">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-white">
              Admin
            </h1>
          </div>
          <LoginForm />
        </section>
      </main>
    );
  }

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
