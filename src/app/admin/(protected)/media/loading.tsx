export default function MediaLoading() {
  return <main aria-label="Loading media" className="mx-auto max-w-7xl space-y-5">
    <div className="h-14 w-64 animate-pulse rounded-lg bg-slate-200" />
    <div className="h-10 w-full animate-pulse rounded-lg bg-slate-200" />
    <div className="grid grid-cols-1 gap-4 min-[430px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => <div className="h-44 animate-pulse rounded-lg bg-slate-200" key={index} />)}
    </div>
  </main>;
}
