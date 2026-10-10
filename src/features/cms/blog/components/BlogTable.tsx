"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { useCmsToast } from "@/components/admin/CmsToastProvider";
import { Button } from "@/components/ui/button";
import { deleteBlogPostAction } from "@/features/cms/blog/actions";
import BlogForm from "@/features/cms/blog/components/BlogForm";
import type { BlogPost } from "@/types/blog";

interface BlogTableProps {
  blogPosts: BlogPost[];
}

export default function BlogTable({ blogPosts }: BlogTableProps) {
  const router = useRouter();
  const notify = useCmsToast();
  const [pending, startTransition] = useTransition();

  function handleDelete(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"?`)) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await deleteBlogPostAction(id);
        if (!result.success) {
          notify("error", result.message ?? "Unable to delete the blog post.");
          return;
        }
        notify("success", result.message ?? "Blog post deleted.");
        router.refresh();
      } catch {
        notify("error", "Unable to delete the blog post.");
      }
    });
  }

  if (blogPosts.length === 0) {
    return <p className="text-sm text-slate-600">No blog posts found.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
      <table className="w-full min-w-4xl border-collapse text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 font-medium" scope="col">Title</th>
            <th className="px-4 py-3 font-medium" scope="col">Slug</th>
            <th className="px-4 py-3 font-medium" scope="col">Status</th>
            <th className="px-4 py-3 font-medium" scope="col">Created</th>
            <th className="px-4 py-3 font-medium" scope="col">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {blogPosts.map((blogPost) => (
            <tr key={blogPost.id}>
              <td className="px-4 py-4 font-medium">{blogPost.title}</td>
              <td className="px-4 py-4 text-slate-600">{blogPost.slug}</td>
              <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{blogPost.published ? "Included in draft site" : "CMS only"}</span></td>
              <td className="whitespace-nowrap px-4 py-4 text-slate-600">{blogPost.createdAt.toLocaleDateString()}</td>
              <td className="px-4 py-4">
                <div className="flex items-start gap-2">
                <details className="rounded-md border border-slate-200 px-3 py-1.5">
                  <summary className="cursor-pointer font-medium">Edit</summary>
                  <div className="mt-4 min-w-72 max-w-xl"><BlogForm blogPost={blogPost} /></div>
                </details>
                <Button
                  disabled={pending}
                  onClick={() => handleDelete(blogPost.id, blogPost.title)}
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
    </>
  );
}
