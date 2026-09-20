"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Container from "@/components/layout/Container";

const navigationItems = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/projects", label: "Projects" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
] as const;

export default function Navbar() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) {
    return null;
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const navigationLinks = navigationItems.map(({ href, label }) => (
    <li key={href}>
      <Link
        className={
          isActive(href)
            ? "font-medium text-slate-950"
            : "text-slate-600 hover:text-slate-950"
        }
        href={href}
        aria-current={isActive(href) ? "page" : undefined}
      >
        {label}
      </Link>
    </li>
  ));

  return (
    <header className="border-b border-slate-200 bg-white">
      <Container className="flex min-h-16 items-center justify-between gap-6">
        <Link className="font-semibold text-slate-950" href="/">
          Portfolio
        </Link>

        <nav className="hidden md:block" aria-label="Primary navigation">
          <ul className="flex items-center gap-6 text-sm">{navigationLinks}</ul>
        </nav>

        <details className="relative md:hidden">
          <summary className="cursor-pointer list-none rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
            Menu
          </summary>
          <nav
            className="absolute right-0 top-full z-20 mt-2 min-w-40 rounded-md border border-slate-200 bg-white p-4 shadow-sm"
            aria-label="Mobile navigation"
          >
            <ul className="flex flex-col gap-3 text-sm">{navigationLinks}</ul>
          </nav>
        </details>
      </Container>
    </header>
  );
}
