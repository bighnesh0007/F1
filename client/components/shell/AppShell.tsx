"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { BarChart3, CalendarDays, History, Radio, Settings2, Trophy } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { sessionIsActive } from "@/lib/live";
import { cn } from "@/components/ui";
import { SettingsSheet } from "./SettingsSheet";
import { LiveOverlays } from "@/components/live/LiveOverlays";
import { Reminders } from "./Reminders";

const NAV = [
  { href: "/", label: "Live", icon: Radio },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/standings", label: "Standings", icon: Trophy },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/replay", label: "Replay", icon: History },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { topics, connection } = useLive();
  const live = sessionIsActive(topics, connection);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-[13px] text-accent-ink">F1</span>
            <span>
              Live<span className="text-accent">.</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <Suspense fallback={<NavLinks live={live} variant="top" pathname={null} />}>
              <ActiveNavLinks live={live} variant="top" />
            </Suspense>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {live && (
              <Link href="/" className="flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-ink md:hidden">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-accent-ink" /> LIVE
              </Link>
            )}
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              className="rounded-xl p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <Settings2 size={19} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 pt-4 pb-24 md:pb-10">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="grid grid-cols-5">
          <Suspense fallback={<NavLinks live={live} variant="bottom" pathname={null} />}>
            <ActiveNavLinks live={live} variant="bottom" />
          </Suspense>
        </div>
      </nav>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <LiveOverlays />
      <Reminders />
    </div>
  );
}

// Reading the URL needs a Suspense boundary on dynamic routes; the fallback renders
// the same links without the active state.
function ActiveNavLinks(props: { live: boolean; variant: "top" | "bottom" }) {
  return <NavLinks {...props} pathname={usePathname()} />;
}

function NavLinks({ live, variant, pathname }: { live: boolean; variant: "top" | "bottom"; pathname: string | null }) {
  const active = (href: string) => pathname != null && (href === "/" ? pathname === "/" : pathname.startsWith(href));
  if (variant === "top") {
    return (
      <>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
              active(href) ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
            )}
          >
            <Icon size={16} />
            {label}
            {href === "/" && live && <span className="live-dot h-1.5 w-1.5 rounded-full bg-accent" />}
          </Link>
        ))}
      </>
    );
  }
  return (
    <>
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active(href) ? "text-accent" : "text-muted")}
        >
          <span className="relative">
            <Icon size={20} />
            {href === "/" && live && <span className="live-dot absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-accent" />}
          </span>
          {label}
        </Link>
      ))}
    </>
  );
}
