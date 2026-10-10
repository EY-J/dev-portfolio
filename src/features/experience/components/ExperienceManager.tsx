"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useCmsToast } from "@/components/admin/CmsToastProvider";
import { Button } from "@/components/ui/button";
import { deleteExperienceAction, moveExperienceAction } from "@/features/experience/actions";
import ExperienceForm from "@/features/experience/components/ExperienceForm";
import type { Experience } from "@/features/experience/types";
import { formatExperienceRange } from "@/features/experience/validation";

export default function ExperienceManager({ experiences }: { experiences: Experience[] }) {
  const router = useRouter();
  const toast = useCmsToast();
  const [editing, setEditing] = useState<Experience | "new" | null>(null);
  const [deleting, setDeleting] = useState<Experience | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteExperienceAction(deleting.id);
      toast(result.success ? "success" : "error", result.message ?? "Unable to delete experience.");
      if (result.success) { setDeleting(null); router.refresh(); }
    });
  }
  function move(id: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveExperienceAction(id, direction);
      toast(result.success ? "success" : "error", result.message ?? "Unable to reorder experience.");
      if (result.success) router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight">Experience</h1><p className="mt-1 text-sm text-slate-600">Manage your professional work history.</p></div>
        <Button onClick={() => setEditing("new")} type="button">+ Add experience</Button>
      </div>
      {experiences.length ? (
        <ol className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white px-5 sm:px-6">
          {experiences.map((experience, index) => (
            <li className="py-6" key={experience.id}>
              <article className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><h2 className="break-words text-lg font-semibold text-slate-950">{experience.role}</h2><p className="break-words font-medium text-slate-700">{experience.company}</p></div>
                  <p className="shrink-0 text-sm text-slate-600">{formatExperienceRange(experience.startDate, experience.endDate, experience.isCurrent)}</p>
                </div>
                {experience.location ? <p className="mt-2 text-sm text-slate-600">{experience.location}</p> : null}
                <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-slate-700">{experience.description}</p>
                {experience.technologies.length ? <p className="mt-3 break-words text-xs text-slate-500">{experience.technologies.join(" · ")}</p> : null}
                <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                  <Button aria-label={`Move ${experience.role} up`} disabled={pending || index === 0} onClick={() => move(experience.id, "up")} type="button" variant="outline">Move Up</Button>
                  <Button aria-label={`Move ${experience.role} down`} disabled={pending || index === experiences.length - 1} onClick={() => move(experience.id, "down")} type="button" variant="outline">Move Down</Button>
                  <Button onClick={() => setEditing(experience)} type="button" variant="outline">Edit</Button>
                  <Button onClick={() => setDeleting(experience)} type="button" variant="destructive">Delete</Button>
                </div>
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8">
          <h2 className="font-semibold">No experience added yet.</h2>
          <p className="mt-1 text-sm text-slate-600">Add your professional work history to display it on your portfolio.</p>
          <Button className="mt-5" onClick={() => setEditing("new")} type="button">Add experience</Button>
        </div>
      )}

      <Dialog.Root onOpenChange={(open) => { if (!open) setEditing(null); }} open={editing !== null}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[1100] bg-slate-950/50" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-[1101] max-h-[min(90vh,850px)] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-5 text-slate-950 shadow-xl sm:p-7">
            <Dialog.Title className="mb-5 text-xl font-semibold">{editing === "new" ? "Add experience" : "Edit experience"}</Dialog.Title>
            <Dialog.Description className="sr-only">Save work history to your draft portfolio.</Dialog.Description>
            {editing ? <ExperienceForm key={editing === "new" ? "new" : editing.id} experience={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} /> : null}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root onOpenChange={(open) => { if (!open && !pending) setDeleting(null); }} open={deleting !== null}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[1100] bg-slate-950/50" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-[1101] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 text-slate-950 shadow-xl">
            <Dialog.Title className="text-lg font-semibold">Delete experience?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-slate-600">{deleting?.role} at {deleting?.company} will be removed from your draft portfolio.</Dialog.Description>
            <div className="mt-6 flex justify-end gap-2"><Dialog.Close className="rounded-md border border-slate-300 px-4 py-2 text-sm" disabled={pending}>Cancel</Dialog.Close><Button disabled={pending} onClick={remove} type="button" variant="destructive">{pending ? "Deleting..." : "Delete"}</Button></div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
