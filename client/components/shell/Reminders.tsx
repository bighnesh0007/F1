"use client";

import { useEffect } from "react";
import { useApi } from "@/lib/useApi";
import { useSettings } from "@/lib/settings";
import type { Weekend } from "@/lib/types";

// Shows a browser notification shortly before each session, while a tab is open.
export function Reminders() {
  const { settings } = useSettings();
  const { data } = useApi<Weekend>(settings.reminders ? "/api/weekend" : null, { refreshMs: 30 * 60_000 });

  useEffect(() => {
    if (!settings.reminders || !data?.current || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const lead = settings.reminderMinutes * 60_000;
    const timers = data.current.sessions
      .map((s) => ({ s, at: Date.parse(s.start) - lead }))
      .filter(({ at }) => at > Date.now() && at - Date.now() < 24 * 3600_000)
      .map(({ s, at }) =>
        setTimeout(() => {
          new Notification(`${s.name} starts in ${settings.reminderMinutes} minutes`, {
            body: data.current!.name,
            tag: `${data.current!.season}-${data.current!.round}-${s.key}`,
          });
        }, at - Date.now()),
      );
    return () => timers.forEach(clearTimeout);
  }, [data, settings.reminders, settings.reminderMinutes]);

  return null;
}
