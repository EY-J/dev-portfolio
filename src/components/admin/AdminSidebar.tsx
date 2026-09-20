"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/dashboard/projects", label: "Projects" },
  { href: "/admin/dashboard/profile", label: "Profile" },
  { href: "/admin/dashboard/social-links", label: "Social Links" },
  { href: "/admin/dashboard/blog", label: "Blog" },
  { href: "/admin/dashboard/messages", label: "Messages" },
  { href: "/admin/dashboard/settings", label: "Settings" },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  if (pathname === "/admin/login") {
    return null;
  }

  return (
    <aside className="w-full shrink-0 border-b border-slate-200 bg-slate-950 text-slate-100 md:min-h-screen md:w-64 md:border-b-0 md:border-r md:border-slate-800">
      <div className="border-b border-slate-800 px-5 py-5">
        <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
          Administration
        </p>
        <p className="mt-1 text-lg font-semibold">Portfolio CMS</p>
      </div>

      <nav className="p-3" aria-label="CMS navigation">
        <ul className="flex gap-1 overflow-x-auto md:flex-col">
          {navigationItems.map((item) => {
            const isActive =
              item.href === "/admin/dashboard"
                ? pathname === item.href
                : pathname.startsWith(item.href);

            return (
              <li className="shrink-0" key={item.href}>
                <Link
                  className={[
                    "block rounded-md px-3 py-2 text-sm font-medium",
                    isActive
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-900 hover:text-white",
                  ].join(" ")}
                  aria-current={isActive ? "page" : undefined}
                  href={item.href}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
