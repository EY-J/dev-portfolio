"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import ProjectForm from "@/features/cms/projects/components/ProjectForm";
import type { Project } from "@/types/project";

interface ProjectFormModalProps {
  project?: Project;
  initialMediaUrl?: string | null;
}

export default function ProjectFormModal({ project, initialMediaUrl }: ProjectFormModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);
  const router = useRouter();
  const isEditing = Boolean(project);

  useEffect(() => {
    if (initialMediaUrl && !project && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [initialMediaUrl, project]);

  function openModal() {
    dialogRef.current?.showModal();
  }

  function closeModal() {
    dialogRef.current?.close();
  }

  function handleSuccess() {
    closeModal();
    setFormKey((key) => key + 1);
    router.refresh();
  }

  return (
    <>
      <Button
        className={isEditing ? undefined : "bg-slate-900 text-white hover:bg-slate-700"}
        onClick={openModal}
        type="button"
        variant={isEditing ? "outline" : "default"}
      >
        {isEditing ? "Edit" : "Add project"}
      </Button>

      <dialog
        className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/70"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeModal();
          }
        }}
        ref={dialogRef}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <h2 className="text-lg font-semibold">
            {isEditing ? "Edit project" : "Create project"}
          </h2>
          <Button
            aria-label="Close project form"
            onClick={closeModal}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="p-5 sm:p-6">
          <ProjectForm
            key={`${project?.id ?? "new"}-${formKey}`}
            onSuccess={handleSuccess}
            project={project}
            initialMediaUrl={initialMediaUrl}
          />
        </div>
      </dialog>
    </>
  );
}
