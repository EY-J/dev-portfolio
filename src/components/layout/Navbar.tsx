"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Container from "@/components/layout/Container";

export default function Navbar() {
  const pathname = usePathname();

  if (pathname === "/" || pathname === "/authpreview" || pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <Container className="flex min-h-16 items-center justify-between gap-6">
        <Link className="font-semibold tracking-tight text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900" href="/">
          AJ / Portfolio
        </Link>
        <Link className="text-sm text-slate-600 transition hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900" href="/messages">Messages</Link>
      </Container>
    </header>
  );
}
