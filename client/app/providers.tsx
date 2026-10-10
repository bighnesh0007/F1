"use client";

import { SettingsProvider } from "@/lib/settings";
import { LiveProvider } from "@/lib/live-context";
import { DriversProvider } from "@/lib/drivers";
import { AppShell } from "@/components/shell/AppShell";
import { AuthProvider } from "@/lib/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <AuthProvider>
        <LiveProvider>
          <DriversProvider>
            <AppShell>{children}</AppShell>
          </DriversProvider>
        </LiveProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}
