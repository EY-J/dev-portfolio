import Link from "next/link";

export default function Hero({ name, title }: { name?: string; title?: string }) {
  return (
    <section className="relative overflow-hidden bg-slate-950 text-white" id="home">
      <div aria-hidden="true" className="absolute -right-24 top-10 h-80 w-80 rounded-full bg-sky-500/15 blur-3xl" />
      <div aria-hidden="true" className="absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">Developer portfolio</p>
        <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl">Hi, I&apos;m {name || "AJ"}.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">{title || "I build thoughtful digital experiences."}</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" href="/#message-me">Message Me</Link>
          <Link className="rounded-lg border border-slate-600 px-5 py-3 text-sm font-semibold text-white transition hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" href="/#projects">View projects</Link>
        </div>
      </div>
    </section>
  );
}
