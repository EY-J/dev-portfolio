"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Container from "@/components/layout/Container";

const navigationItems = [
  { href: "/#home", label: "Home" },
  { href: "/#about", label: "About" },
  { href: "/#projects", label: "Projects" },
  { href: "/#blog", label: "Blog" },
  { href: "/#contact", label: "Contact" },
  { href: "/#message-me", label: "Message Me" },
] as const;

export default function Navbar() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) {
    return null;
  }

  const navigationLinks = navigationItems.map(({ href, label }) => (
    <li key={href}>
      <Link
        className="text-slate-600 transition hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        href={href}
      >
        {label}
      </Link>
    </li>
  ));

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <Container className="flex min-h-16 items-center justify-between gap-6">
        <Link className="font-semibold tracking-tight text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900" href="/#home">
          AJ / Portfolio
        </Link>

        <nav className="hidden md:block" aria-label="Primary navigation">
          <ul className="flex items-center gap-5 text-sm">{navigationLinks}</ul>
        </nav>

        <details className="relative md:hidden">
          <summary className="cursor-pointer list-none rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">
            Menu
          </summary>
          <nav
            className="absolute right-0 top-full z-20 mt-2 min-w-44 rounded-md border border-slate-200 bg-white p-4 shadow-lg"
            aria-label="Mobile navigation"
          >
            <ul className="flex flex-col gap-3 text-sm">{navigationLinks}</ul>
          </nav>
        </details>
      </Container>
    </header>
  );
}
