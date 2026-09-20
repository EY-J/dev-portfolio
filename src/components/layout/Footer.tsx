"use client";

import { usePathname } from "next/navigation";

import Container from "@/components/layout/Container";

export interface FooterSocialLink {
  label: string;
  href: string;
}

const placeholderSocialLinks: FooterSocialLink[] = [
  { label: "GitHub", href: "#" },
  { label: "LinkedIn", href: "#" },
  { label: "Email", href: "#" },
];

interface FooterProps {
  socialLinks?: FooterSocialLink[];
}

export default function Footer({ socialLinks = placeholderSocialLinks }: FooterProps) {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <footer className="border-t border-slate-200 bg-white">
      <Container className="flex flex-col gap-4 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getFullYear()} Developer Portfolio.</p>

        <nav aria-label="Social links">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {socialLinks.map(({ href, label }) => (
              <li key={label}>
                <a className="hover:text-slate-950" href={href}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
