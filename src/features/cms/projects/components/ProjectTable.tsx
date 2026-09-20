import ProjectForm from "@/features/cms/projects/components/ProjectForm";
import DeleteProjectButton from "@/features/cms/projects/components/DeleteProjectButton";
import type { Project } from "@/types/project";

interface ProjectTableProps {
  projects: Project[];
}

export default function ProjectTable({ projects }: ProjectTableProps) {
  if (projects.length === 0) {
    return <p className="text-sm text-slate-600">No projects found.</p>;
  }

  return (
    <div className="overflow-x-auto">
    <table className="w-full min-w-3xl border-collapse text-left text-sm">
      <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
        <tr>
          <th className="px-4 py-3 font-medium" scope="col">Title</th>
          <th className="px-4 py-3 font-medium" scope="col">Technologies</th>
          <th className="px-4 py-3 font-medium" scope="col">Created</th>
          <th className="px-4 py-3 font-medium" scope="col">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200">
        {projects.map((project) => (
          <tr key={project.id}>
            <td className="px-4 py-4 font-medium text-slate-950">{project.title}</td>
            <td className="px-4 py-4 text-slate-600">{project.technologies.join(", ")}</td>
            <td className="whitespace-nowrap px-4 py-4 text-slate-600">{project.createdAt.toLocaleDateString()}</td>
            <td className="px-4 py-4">
              <div className="flex items-start gap-2">
              <details className="rounded-md border border-slate-200 px-3 py-1.5">
                <summary className="cursor-pointer font-medium">Edit</summary>
                <div className="mt-4 min-w-72 max-w-xl"><ProjectForm project={project} /></div>
              </details>
              <DeleteProjectButton
                projectId={project.id}
                projectTitle={project.title}
              />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
