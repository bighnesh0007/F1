"use client";

import { SettingsProvider } from "@/lib/settings";
import { LiveProvider } from "@/lib/live-context";
import { DriversProvider } from "@/lib/drivers";
import { AppShell } from "@/components/shell/AppShell";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <LiveProvider>
        <DriversProvider>
          <AppShell>{children}</AppShell>
        </DriversProvider>
      </LiveProvider>
    </SettingsProvider>
  );
}
