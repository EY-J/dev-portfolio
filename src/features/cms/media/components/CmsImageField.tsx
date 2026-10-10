"use client";

import MediaSelector from "@/features/cms/media/components/MediaSelector";

interface CmsImageFieldProps {
  id: string;
  label: string;
  name: string;
  onChange: (value: string) => void;
  onRemove?: () => void;
  value: string;
  disabled?: boolean;
  required?: boolean;
  allowRemove?: boolean;
}

export default function CmsImageField({ id, label, name, onChange, onRemove, value, disabled = false, required = false, allowRemove = false }: CmsImageFieldProps) {
  return <div className="space-y-2">
    <label className="block text-sm font-medium text-slate-700" id={`${id}-label`}>{label}{required ? " (required)" : ""}</label>
    <MediaSelector disabled={disabled} id={id} label={label} onChange={onChange} value={value} />
    {allowRemove && value ? <button className="text-sm font-medium text-slate-700 underline underline-offset-4" disabled={disabled} onClick={() => { onChange(""); onRemove?.(); }} type="button">Clear image</button> : null}
    <input name={name} type="hidden" value={value} />
    {required && !value ? <p className="text-sm text-red-700" role="alert">Select a project image before saving.</p> : null}
  </div>;
}
