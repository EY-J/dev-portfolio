"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { useCmsToast } from "@/components/admin/CmsToastProvider";
import { Button } from "@/components/ui/button";
import { deleteProjectAction } from "@/features/cms/projects/actions";

interface DeleteProjectButtonProps {
  projectId: string;
  projectTitle: string;
}

export default function DeleteProjectButton({
  projectId,
  projectTitle,
}: DeleteProjectButtonProps) {
  const router = useRouter();
  const notify = useCmsToast();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm(`Delete "${projectTitle}"?`)) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await deleteProjectAction(projectId);

        if (!result.success) {
          notify("error", result.message ?? "Unable to delete the project.");
          return;
        }

        notify("success", result.message ?? "Project deleted.");
        router.refresh();
      } catch {
        notify("error", "Unable to delete the project.");
      }
    });
  }

  return (
      <Button
        disabled={pending}
        onClick={handleDelete}
        type="button"
        variant="destructive"
      >
        {pending ? "Deleting..." : "Delete"}
      </Button>
  );
}
