"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm(`Delete "${projectTitle}"?`)) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteProjectAction(projectId);

        if (!result.success) {
          setError(result.message ?? "Unable to delete the project.");
          return;
        }

        router.refresh();
      } catch {
        setError("Unable to delete the project.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        onClick={handleDelete}
        type="button"
        variant="destructive"
      >
        {pending ? "Deleting..." : "Delete"}
      </Button>
      {error ? (
        <p className="text-sm text-red-600" aria-live="polite" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
