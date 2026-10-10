"use client";

import { MotionConfig } from "motion/react";
import { SettingsProvider, useSettings } from "@/lib/settings";
import { LiveProvider } from "@/lib/live-context";
import { DriversProvider } from "@/lib/drivers";
import { AppShell } from "@/components/shell/AppShell";
import { AuthProvider } from "@/lib/auth";
import { clerkEnabled } from "@/lib/clerk";
import { ClerkBridge } from "@/components/account/ClerkControls";
import { Monitoring } from "@/components/shell/Monitoring";

// Animations follow the device's reduced-motion setting, or the app's own switch.
function Motion({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  return <MotionConfig reducedMotion={settings.reduceMotion ? "always" : "user"}>{children}</MotionConfig>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <Monitoring />
      <Motion>
      <AuthProvider>
        {clerkEnabled && <ClerkBridge />}
        <LiveProvider>
          <DriversProvider>
            <AppShell>{children}</AppShell>
          </DriversProvider>
        </LiveProvider>
      </AuthProvider>
      </Motion>
    </SettingsProvider>
  );
}
