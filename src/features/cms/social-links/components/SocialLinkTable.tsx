"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { deleteSocialLinkAction } from "@/features/cms/social-links/actions";
import SocialLinkForm from "@/features/cms/social-links/components/SocialLinkForm";
import type { SocialLink } from "@/types/social-link";

interface SocialLinkTableProps {
  socialLinks: SocialLink[];
}

export default function SocialLinkTable({ socialLinks }: SocialLinkTableProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete(id: string, platform: string) {
    if (!window.confirm(`Delete the ${platform} link?`)) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteSocialLinkAction(id);
        if (!result.success) {
          setError(result.message);
          return;
        }
        router.refresh();
      } catch {
        setError("Unable to delete the social link.");
      }
    });
  }

  if (socialLinks.length === 0) {
    return <p className="text-sm text-slate-600">No social links found.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
      <table className="w-full min-w-3xl border-collapse text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 font-medium" scope="col">Platform</th>
            <th className="px-4 py-3 font-medium" scope="col">URL</th>
            <th className="px-4 py-3 font-medium" scope="col">Icon</th>
            <th className="px-4 py-3 font-medium" scope="col">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {socialLinks.map((socialLink) => (
            <tr key={socialLink.id}>
              <td className="px-4 py-4 font-medium">{socialLink.platform}</td>
              <td className="max-w-xs px-4 py-4">
                <a className="block truncate text-slate-600 underline underline-offset-4" href={socialLink.url} rel="noreferrer" target="_blank">
                  {socialLink.url}
                </a>
              </td>
              <td className="px-4 py-4 text-slate-600">{socialLink.icon}</td>
              <td className="px-4 py-4">
                <div className="flex items-start gap-2">
                <details className="rounded-md border border-slate-200 px-3 py-1.5">
                  <summary className="cursor-pointer font-medium">Edit</summary>
                  <div className="mt-4 min-w-72 max-w-xl"><SocialLinkForm socialLink={socialLink} /></div>
                </details>
                <Button
                  disabled={pending}
                  onClick={() => handleDelete(socialLink.id, socialLink.platform)}
                  type="button"
                  variant="destructive"
                >
                  Delete
                </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-red-600" aria-live="polite" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
