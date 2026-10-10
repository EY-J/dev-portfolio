"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { useCmsActionToast } from "@/components/admin/CmsToastProvider";
import {
  createBlogPostAction,
  updateBlogPostAction,
} from "@/features/cms/blog/actions";
import type { BlogActionState } from "@/features/cms/blog/types";
import CmsImageField from "@/features/cms/media/components/CmsImageField";
import type { BlogPost } from "@/types/blog";

interface BlogFormProps {
  blogPost?: BlogPost;
  initialMediaUrl?: string | null;
}

const initialState: BlogActionState = {
  success: false,
  message: null,
};

const fieldClassName =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100";
const labelClassName = "block text-sm font-medium text-slate-700";

export default function BlogForm({ blogPost, initialMediaUrl }: BlogFormProps) {
  const action = blogPost
    ? updateBlogPostAction.bind(null, blogPost.id)
    : createBlogPostAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [imageUrl, setImageUrl] = useState(initialMediaUrl ?? blogPost?.imageUrl ?? "");
  useCmsActionToast(state);
  const prefix = blogPost ? `blog-${blogPost.id}` : "new-blog";

  return (
    <form className="space-y-4" action={formAction}>
      <fieldset className="grid gap-5" disabled={pending}>
        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor={`${prefix}-title`}>Title</label>
          <input
            className={fieldClassName}
            defaultValue={blogPost?.title}
            id={`${prefix}-title`}
            name="title"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor={`${prefix}-slug`}>Slug</label>
          <input
            className={fieldClassName}
            defaultValue={blogPost?.slug}
            id={`${prefix}-slug`}
            name="slug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClassName} htmlFor={`${prefix}-content`}>Content</label>
          <textarea
            className={`${fieldClassName} min-h-48 resize-y`}
            defaultValue={blogPost?.content}
            id={`${prefix}-content`}
            name="content"
            required
          />
        </div>
        <CmsImageField allowRemove disabled={pending} id={`${prefix}-image`} label="Cover image" name="image_url" onChange={setImageUrl} value={imageUrl} />
        <div className="flex items-center gap-2">
          <input
            className="size-4 rounded border-slate-300"
            defaultChecked={blogPost?.published}
            id={`${prefix}-published`}
            name="published"
            type="checkbox"
          />
          <label className="text-sm font-medium text-slate-700" htmlFor={`${prefix}-published`}>Include on site after Publish changes</label>
        </div>
        <Button className="w-fit bg-slate-900 px-4 text-white hover:bg-slate-700" type="submit">
          {pending
            ? "Saving..."
            : blogPost
              ? "Save changes"
              : "Create blog post"}
        </Button>
      </fieldset>
    </form>
  );
}
