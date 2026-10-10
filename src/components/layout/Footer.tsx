"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Container from "@/components/layout/Container";

export default function Footer() {
  const pathname = usePathname();

  if (pathname === "/" || pathname === "/authpreview" || pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <footer className="border-t border-slate-200 bg-white">
      <Container className="flex flex-col gap-4 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getFullYear()} AJ / Portfolio.</p>

        <nav aria-label="Footer navigation">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            <li><Link className="hover:text-slate-950" href="/">Portfolio</Link></li>
            <li><Link className="hover:text-slate-950" href="/messages">Messages</Link></li>
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
