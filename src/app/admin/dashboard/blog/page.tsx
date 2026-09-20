import BlogForm from "@/features/cms/blog/components/BlogForm";
import BlogTable from "@/features/cms/blog/components/BlogTable";
import { getBlogPosts } from "@/features/cms/blog/service";

export default async function BlogPage() {
  const blogPosts = await getBlogPosts();

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Blog</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create drafts and manage published articles.
        </p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">Create blog post</h2>
        <BlogForm />
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">Blog posts</h2>
        <BlogTable blogPosts={blogPosts} />
      </section>
    </main>
  );
}
