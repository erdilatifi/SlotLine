import { useState, type ReactNode } from "react";
import { NavLink } from "react-router";
import { LogoMark } from "./Logo";
import { Button } from "./ui";
import { cn } from "../lib/cn";
import type { OrgSummary } from "../lib/dashboardApi";

const NAV = [
  { to: "/dashboard", label: "Bookings", icon: "calendar", end: true },
  { to: "/dashboard/services", label: "Services", icon: "tag" },
  { to: "/dashboard/team", label: "Team", icon: "users" },
  { to: "/dashboard/clients", label: "Clients", icon: "person" },
  { to: "/dashboard/settings", label: "Settings", icon: "gear" },
];

const ICONS: Record<string, string> = {
  calendar: "M3 6.2h12M5.2 2.8v2.4M12.8 2.8v2.4M3 4.4h12v10.2H3V4.4z",
  tag: "M2.8 8.6V3h5.6l6.4 6.4-5.6 5.6L2.8 8.6zM5.6 5.6h.01",
  users:
    "M11.4 14v-1.3a2.6 2.6 0 00-2.6-2.6H4.6A2.6 2.6 0 002 12.7V14M6.7 7.4a2.6 2.6 0 100-5.2 2.6 2.6 0 000 5.2zM16 14v-1.3a2.6 2.6 0 00-2-2.5M12.4 2.3a2.6 2.6 0 010 5",
  person: "M9 9a3 3 0 100-6 3 3 0 000 6zM3.4 15c0-2.6 2.5-4.2 5.6-4.2s5.6 1.6 5.6 4.2",
  gear: "M9 11.4a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8zM7.6 2.4h2.8l.35 1.85 1.5.87 1.77-.63 1.4 2.42-1.42 1.22v1.74l1.42 1.22-1.4 2.42-1.77-.63-1.5.87L10.4 15.6H7.6l-.35-1.85-1.5-.87-1.77.63-1.4-2.42 1.42-1.22V8.13L2.58 6.91l1.4-2.42 1.77.63 1.5-.87L7.6 2.4z",
};

function Icon({ name }: { name: string }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d={ICONS[name]}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A sidebar at every size above a phone. Every booking tool people already
 * use puts navigation down the left, and Jakob's law says matching that is
 * a feature — nobody should have to learn where "Team" lives. On a phone it
 * becomes a drawer rather than collapsing into a top bar, so the same five
 * destinations stay one tap away instead of turning into a different
 * navigation pattern at the size where screen space is tightest.
 */
export function DashboardShell({
  orgs,
  activeSlug,
  onSwitchOrg,
  onLogout,
  live,
  refreshing,
  children,
}: {
  orgs: OrgSummary[];
  activeSlug: string | null;
  onSwitchOrg: (slug: string) => void;
  onLogout: () => void;
  live: boolean;
  refreshing: boolean;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const activeOrg = orgs.find((org) => org.slug === activeSlug);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="relative px-3">
        <button
          onClick={() => setSwitcherOpen(!switcherOpen)}
          disabled={orgs.length < 2}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface disabled:cursor-default"
        >
          <LogoMark />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">
              {activeOrg?.name ?? "Slotline"}
            </span>
            {live && (
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <span
                  className={cn("size-1.5 rounded-full bg-positive", refreshing && "animate-pulse")}
                />
                {refreshing ? "Updating" : "Live"}
              </span>
            )}
          </span>
          {orgs.length > 1 && <span className="text-muted">⌄</span>}
        </button>

        {switcherOpen && orgs.length > 1 && (
          <div className="animate-rise absolute inset-x-3 top-full z-50 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-lift">
            {orgs.map((org) => (
              <button
                key={org.slug}
                onClick={() => {
                  onSwitchOrg(org.slug);
                  setSwitcherOpen(false);
                  setDrawerOpen(false);
                }}
                className={cn(
                  "block w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-sunken",
                  org.slug === activeSlug && "font-medium",
                )}
              >
                {org.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="mt-5 flex-1 space-y-0.5 px-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? false}
            onClick={() => setDrawerOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150",
                isActive
                  ? "bg-accent-soft font-medium text-accent-deep"
                  : "text-ink-soft hover:bg-surface hover:text-ink",
              )
            }
          >
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-3">
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onLogout}>
          Log out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-sunken">
      <div className="mx-auto flex max-w-[1500px]">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line py-5 sm:block">
          {sidebar}
        </aside>

        {drawerOpen && (
          <>
            <button
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px] sm:hidden"
            />
            <aside className="animate-rise fixed inset-y-0 left-0 z-50 w-64 border-r border-line bg-surface-sunken py-5 shadow-float sm:hidden">
              {sidebar}
            </aside>
          </>
        )}

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-line bg-surface-sunken/85 backdrop-blur-md sm:hidden">
            <div className="flex h-14 items-center justify-between px-4">
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                className="flex items-center gap-2.5"
              >
                <LogoMark />
                <span className="truncate text-sm font-medium">
                  {activeOrg?.name ?? "Slotline"}
                </span>
              </button>
              <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(true)}>
                Menu
              </Button>
            </div>
          </header>

          <main className="px-5 py-6 sm:px-8 sm:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
