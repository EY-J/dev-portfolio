import ProjectFormModal from "@/features/cms/projects/components/ProjectFormModal";
import ProjectTable from "@/features/cms/projects/components/ProjectTable";
import { getProjects } from "@/features/cms/projects/service";

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-slate-600">
            Create and maintain the projects shown in your portfolio.
          </p>
        </div>
        <ProjectFormModal />
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">Existing projects</h2>
        <ProjectTable projects={projects} />
      </section>
    </main>
  );
}
