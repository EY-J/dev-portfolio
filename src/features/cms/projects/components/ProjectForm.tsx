"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useCmsActionToast } from "@/components/admin/CmsToastProvider";
import {
  createProjectAction,
  updateProjectAction,
} from "@/features/cms/projects/actions";
import type { ProjectActionState } from "@/features/cms/projects/types";
import CmsImageField from "@/features/cms/media/components/CmsImageField";
import type { Project } from "@/types/project";

interface ProjectFormProps {
  onSuccess?: () => void;
  project?: Project;
  initialMediaUrl?: string | null;
}

const initialState: ProjectActionState = {
  success: false,
  message: null,
};

const fieldClassName =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100";
const labelClassName = "block text-sm font-medium text-slate-700";

export default function ProjectForm({ onSuccess, project, initialMediaUrl }: ProjectFormProps) {
  const action = project
    ? updateProjectAction.bind(null, project.id)
    : createProjectAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  useCmsActionToast(state);
  const [imageUrl, setImageUrl] = useState(initialMediaUrl ?? project?.imageUrl ?? "");
  const fieldPrefix = project ? `project-${project.id}` : "new-project";

  useEffect(() => {
    if (state.success) {
      onSuccess?.();
    }
  }, [onSuccess, state.success]);

  return (
    <form className="space-y-4" action={formAction}>
      <fieldset className="grid gap-5" disabled={pending}>
        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor={`${fieldPrefix}-title`}>Title</label>
          <input
            className={fieldClassName}
            defaultValue={project?.title}
            id={`${fieldPrefix}-title`}
            name="title"
            required
            type="text"
          />
        </div>

        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor={`${fieldPrefix}-description`}>Description</label>
          <textarea
            className={`${fieldClassName} min-h-28 resize-y`}
            defaultValue={project?.description}
            id={`${fieldPrefix}-description`}
            name="description"
            required
          />
        </div>

        <CmsImageField disabled={pending} id={`${fieldPrefix}-image`} label="Project image" name="image_url" onChange={setImageUrl} required value={imageUrl} />

        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor={`${fieldPrefix}-technologies`}>
            Technologies (comma-separated)
          </label>
          <input
            className={fieldClassName}
            defaultValue={project?.technologies.join(", ")}
            id={`${fieldPrefix}-technologies`}
            name="technologies"
            required
            type="text"
          />
        </div>

        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor={`${fieldPrefix}-github-url`}>GitHub URL</label>
          <input
            className={fieldClassName}
            defaultValue={project?.githubUrl}
            id={`${fieldPrefix}-github-url`}
            name="github_url"
            type="url"
          />
        </div>

        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor={`${fieldPrefix}-live-url`}>Live URL</label>
          <input
            className={fieldClassName}
            defaultValue={project?.liveUrl}
            id={`${fieldPrefix}-live-url`}
            name="live_url"
            type="url"
          />
        </div>

        <Button className="w-fit bg-slate-900 px-4 text-white hover:bg-slate-700" disabled={pending || !imageUrl} type="submit">
          {pending
            ? project
              ? "Saving..."
              : "Creating..."
            : project
              ? "Save changes"
              : "Create project"}
        </Button>
      </fieldset>

    </form>
  );
}
