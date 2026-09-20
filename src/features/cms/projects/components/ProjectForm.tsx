"use client";

import Image from "next/image";
import { type ChangeEvent, useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  createProjectAction,
  updateProjectAction,
} from "@/features/cms/projects/actions";
import type { ProjectActionState } from "@/features/cms/projects/types";
import {
  deleteProjectImage,
  uploadProjectImage,
} from "@/lib/supabase/storage";
import type { Project } from "@/types/project";

interface ProjectFormProps {
  project?: Project;
}

const initialState: ProjectActionState = {
  success: false,
  message: null,
};

const fieldClassName =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100";
const labelClassName = "block text-sm font-medium text-slate-700";

export default function ProjectForm({ project }: ProjectFormProps) {
  const action = project
    ? updateProjectAction.bind(null, project.id)
    : createProjectAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [imageUrl, setImageUrl] = useState(project?.imageUrl ?? "");
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(
    null
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fieldPrefix = project ? `project-${project.id}` : "new-project";

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setUploadError(null);
    setUploading(true);

    try {
      const upload = await uploadProjectImage(file);

      if (uploadedImagePath) {
        await deleteProjectImage(uploadedImagePath).catch(() => undefined);
      }

      setUploadedImagePath(upload.path);
      setImageUrl(upload.publicUrl);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Unable to upload the image."
      );
      event.target.value = "";
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="space-y-4" action={formAction}>
      <fieldset className="grid gap-5" disabled={pending || uploading}>
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

        <div className="space-y-2">
          <label className={labelClassName} htmlFor={`${fieldPrefix}-image`}>Project image</label>
          <input
            accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
            className={`${fieldClassName} file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm file:font-medium`}
            id={`${fieldPrefix}-image`}
            onChange={handleImageChange}
            required={!imageUrl}
            type="file"
          />
          <input name="image_url" type="hidden" value={imageUrl} />
          {imageUrl ? (
            <Image
              alt={`${project?.title ?? "Project"} preview`}
              className="rounded-md border border-slate-200 object-cover"
              height={180}
              src={imageUrl}
              unoptimized
              width={320}
            />
          ) : null}
          {uploadError ? (
            <p className="text-sm text-red-600" aria-live="polite" role="alert">
              {uploadError}
            </p>
          ) : null}
        </div>

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

        <Button className="w-fit bg-slate-900 px-4 text-white hover:bg-slate-700" disabled={pending || uploading} type="submit">
          {uploading
            ? "Uploading image..."
            : pending
            ? project
              ? "Saving..."
              : "Creating..."
            : project
              ? "Save changes"
              : "Create project"}
        </Button>
      </fieldset>

      {state.message ? (
        <p className={state.success ? "text-sm text-emerald-700" : "text-sm text-red-600"} aria-live="polite" role={state.success ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
