"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { useSettings, type Settings } from "@/lib/settings";
import { useDrivers } from "@/lib/drivers";
import { pushKey, pushSupported, syncPush } from "@/lib/push";
import { Section, Toggle } from "./Toggle";

export const pushPrefs = (s: Settings) => ({ sessions: s.pushSessions, flags: s.pushFlags, driver: s.pushDriver ? s.favouriteDriver : null });

export function PushSettings() {
  const { settings, update } = useSettings();
  const { get } = useDrivers();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    pushKey().then((k) => alive && setAvailable(Boolean(k) && pushSupported()));
    return () => {
      alive = false;
    };
  }, []);

  const change = async (patch: Partial<Settings>) => {
    setBusy(true);
    setError(null);
    try {
      await syncPush(pushPrefs({ ...settings, ...patch }));
      update(patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change notifications");
    } finally {
      setBusy(false);
    }
  };

  const fav = settings.favouriteDriver ? get(settings.favouriteDriver) : null;
  return (
    <Section icon={<BellRing size={16} />} title="Phone notifications" hint="Sent even when the app is closed. On iPhone, add F1 Live to your home screen first.">
      {available === false ? (
        <p className="text-sm text-muted">{pushSupported() ? "Not set up on this server yet." : "This browser can't receive notifications."}</p>
      ) : (
        <div className={busy ? "pointer-events-none space-y-3 opacity-60" : "space-y-3"}>
          <Toggle label="Session about to start" hint="15 minutes before practice, qualifying, sprint and race." checked={settings.pushSessions} onChange={(pushSessions) => change({ pushSessions })} />
          <Toggle label="Safety car and red flags" checked={settings.pushFlags} onChange={(pushFlags) => change({ pushFlags })} />
          <Toggle
            label={fav ? `${fav.tla} pit stops` : "My driver's pit stops"}
            hint={fav ? undefined : "Pick a favourite driver above first."}
            checked={settings.pushDriver && Boolean(fav)}
            onChange={(pushDriver) => fav && change({ pushDriver })}
          />
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        </div>
      )}
    </Section>
  );
}
