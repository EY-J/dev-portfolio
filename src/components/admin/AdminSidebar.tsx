"use client";

import {
  BriefcaseBusiness,
  ChevronDown,
  House,
  Inbox,
  Images,
  Link2,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const primaryNavigationItems = [
  { href: "/admin", icon: House, label: "Dashboard" },
  { href: "/admin/messages", icon: Inbox, label: "Messages" },
];

const workspaceNavigationItems = [
  { href: "/admin/projects", icon: BriefcaseBusiness, label: "Projects" },
  { href: "/admin/profile", icon: UserRound, label: "Profile" },
  { href: "/admin/social-links", icon: Link2, label: "Social Links" },
  { href: "/admin/experience", icon: BriefcaseBusiness, label: "Experience" },
  { href: "/admin/media", icon: Images, label: "Media" },
  { href: "/admin/settings", icon: Settings, label: "Settings" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [workspaceOpen, setWorkspaceOpen] = useState(true);

  const matchesQuery = (label: string) =>
    label.toLowerCase().includes(query.trim().toLowerCase());

  const primaryItems = primaryNavigationItems.filter((item) =>
    matchesQuery(item.label)
  );
  const workspaceItems = workspaceNavigationItems.filter((item) =>
    matchesQuery(item.label)
  );

  const renderNavigationItems = (
    items: typeof primaryNavigationItems | typeof workspaceNavigationItems
  ) =>
    items.map((item) => {
      const Icon = item.icon;
      const isActive =
        item.href === "/admin"
          ? pathname === item.href
          : pathname.startsWith(item.href);

      return (
        <li key={item.href}>
          <Link
            className={[
              "flex h-11 items-center gap-3 rounded-lg px-3 font-heading text-[15px] font-normal leading-5 tracking-normal",
              isActive
                ? "bg-slate-100 text-slate-950"
                : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
            ].join(" ")}
            aria-current={isActive ? "page" : undefined}
            href={item.href}
          >
            <Icon
              aria-hidden="true"
              className="size-5 shrink-0 text-slate-900"
              strokeWidth={1.8}
            />
            {item.label}
          </Link>
        </li>
      );
    });

  return (
    <aside className="w-full shrink-0 border-b border-slate-200 bg-white text-slate-950 md:min-h-screen md:w-72 md:border-b-0 md:border-r">
      <div className="p-4 md:px-8 md:pb-6 md:pt-8">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-500"
            strokeWidth={1.8}
          />
          <input
            aria-label="Search navigation"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-11 font-heading text-sm text-slate-950 outline-none shadow-sm placeholder:text-slate-500 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            type="search"
            value={query}
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 font-sans text-xs text-slate-500 shadow-sm">
            /
          </kbd>
        </div>
      </div>

      <nav className="space-y-5 px-4 pb-5 md:px-8" aria-label="CMS navigation">
        {primaryItems.length > 0 ? (
          <ul className="space-y-1">{renderNavigationItems(primaryItems)}</ul>
        ) : null}

        {workspaceItems.length > 0 ? (
          <section aria-labelledby="workspace-navigation-heading">
            <button
              aria-controls="workspace-navigation-links"
              aria-expanded={workspaceOpen}
              className="mb-2 flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              onClick={() => setWorkspaceOpen((open) => !open)}
              type="button"
            >
              <ChevronDown
                aria-hidden="true"
                className={workspaceOpen ? "size-4" : "size-4 -rotate-90"}
                strokeWidth={1.8}
              />
              <span
                className="font-heading text-sm font-normal"
                id="workspace-navigation-heading"
              >
                Workspace
              </span>
            </button>
            {workspaceOpen ? (
              <ul className="space-y-1" id="workspace-navigation-links">
                {renderNavigationItems(workspaceItems)}
              </ul>
            ) : null}
          </section>
        ) : null}

        {primaryItems.length === 0 && workspaceItems.length === 0 ? (
          <p className="px-3 text-sm text-slate-500">No navigation links found.</p>
        ) : null}
      </nav>
    </aside>
  );
}
