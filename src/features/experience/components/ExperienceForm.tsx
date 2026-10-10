"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCmsActionToast } from "@/components/admin/CmsToastProvider";
import { Button } from "@/components/ui/button";
import { createExperienceAction, updateExperienceAction } from "@/features/experience/actions";
import { initialExperienceState, type Experience } from "@/features/experience/types";

const inputStyle = "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100";

export default function ExperienceForm({ experience, onCancel, onSaved }: {
  experience?: Experience; onCancel: () => void; onSaved: () => void;
}) {
  const router = useRouter();
  const [isCurrent, setIsCurrent] = useState(experience?.isCurrent ?? false);
  const [endDate, setEndDate] = useState(experience?.endDate ?? "");
  const [state, formAction, pending] = useActionState(
    experience ? updateExperienceAction.bind(null, experience.id) : createExperienceAction,
    initialExperienceState,
  );
  useCmsActionToast(state);
  useEffect(() => {
    if (state.success) { onSaved(); router.refresh(); }
  }, [state, onSaved, router]);

  const error = (field: string) => state.fieldErrors?.[field]
    ? <p className="text-sm text-red-700" role="alert">{state.fieldErrors[field]}</p> : null;
  const field = (name: string, label: string, required = false, type = "text", initial = "") => (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700" htmlFor={`experience-${experience?.id ?? "new"}-${name}`}>{label}{required ? " *" : ""}</label>
      <input aria-invalid={Boolean(state.fieldErrors?.[name])} className={inputStyle} defaultValue={initial} id={`experience-${experience?.id ?? "new"}-${name}`} maxLength={name === "companyUrl" ? 2048 : 120} name={name} required={required} type={type} />
      {error(name)}
    </div>
  );

  return (
    <form action={formAction} className="space-y-5">
      <fieldset className="space-y-5" disabled={pending}>
        <div className="grid gap-5 sm:grid-cols-2">
          {field("role", "Role / Position", true, "text", experience?.role)}
          {field("company", "Company", true, "text", experience?.company)}
        </div>
        {field("location", "Location", false, "text", experience?.location ?? "")}
        <div className="grid gap-5 sm:grid-cols-2">
          {field("startDate", "Start Date", true, "month", experience?.startDate)}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700" htmlFor="experience-end-date">End Date</label>
            <input aria-invalid={Boolean(state.fieldErrors?.endDate)} className={inputStyle} disabled={isCurrent} id="experience-end-date" name="endDate" onChange={(event) => setEndDate(event.target.value)} required={!isCurrent} type="month" value={endDate} />
            {error("endDate")}
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
          <input checked={isCurrent} className="size-4" name="isCurrent" onChange={(event) => { setIsCurrent(event.target.checked); if (event.target.checked) setEndDate(""); }} type="checkbox" />
          Currently working here
        </label>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="experience-description">Description *</label>
          <textarea aria-invalid={Boolean(state.fieldErrors?.description)} className={`${inputStyle} min-h-32 resize-y`} defaultValue={experience?.description} id="experience-description" maxLength={5000} name="description" required rows={5} />
          {error("description")}
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="experience-technologies">Technologies / Skills</label>
          <input className={inputStyle} defaultValue={experience?.technologies.join(", ") ?? ""} id="experience-technologies" name="technologies" placeholder="Next.js, TypeScript, Supabase" type="text" />
          <p className="text-xs text-slate-500">Separate skills with commas.</p>
          {error("technologies")}
        </div>
        {field("companyUrl", "Company URL", false, "url", experience?.companyUrl ?? "")}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-5">
          <Button onClick={onCancel} type="button" variant="outline">Cancel</Button>
          <Button disabled={pending} type="submit">{pending ? "Saving..." : experience ? "Save changes" : "Save Experience"}</Button>
        </div>
      </fieldset>
    </form>
  );
}
