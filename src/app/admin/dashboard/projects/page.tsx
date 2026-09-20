import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/features/cms/auth/service";
import ProjectForm from "@/features/cms/projects/components/ProjectForm";
import ProjectTable from "@/features/cms/projects/components/ProjectTable";
import { getProjects } from "@/features/cms/projects/service";

export default async function ProjectsPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/admin/login");
  }

  const projects = await getProjects();

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create and maintain the projects shown in your portfolio.
        </p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">Create project</h2>
        <ProjectForm />
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">Existing projects</h2>
        <ProjectTable projects={projects} />
      </section>
    </main>
  );
}
