"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type LivePanel = "battles" | "feed" | "weather" | "radio";

export type Settings = {
  theme: "system" | "dark" | "light";
  teamAccent: boolean;
  favouriteDriver: string | null; // racing number
  favouriteTeamColour: string | null;
  spoilerFree: boolean;
  sounds: boolean;
  alerts: boolean; // pop-up alerts for overtakes, pit stops, fastest laps
  flagEffects: boolean;
  reminders: boolean;
  reminderMinutes: number;
  livePanels: { id: LivePanel; visible: boolean }[];
  colourBlind: boolean;
  reduceMotion: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  teamAccent: true,
  favouriteDriver: null,
  favouriteTeamColour: null,
  spoilerFree: false,
  sounds: true,
  alerts: true,
  flagEffects: true,
  reminders: false,
  reminderMinutes: 15,
  livePanels: [
    { id: "battles", visible: true },
    { id: "feed", visible: true },
    { id: "weather", visible: true },
    { id: "radio", visible: true },
  ],
  colourBlind: false,
  reduceMotion: false,
};

const STORAGE_KEY = "f1live.settings";

type Ctx = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  ready: boolean;
};

const SettingsContext = createContext<Ctx>({ settings: DEFAULT_SETTINGS, update: () => {}, ready: false });

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw);
    // Keep newly added panels when merging older saved settings.
    const panels = [...(saved.livePanels ?? [])].filter((p: { id: LivePanel }) =>
      DEFAULT_SETTINGS.livePanels.some((d) => d.id === p.id),
    );
    for (const p of DEFAULT_SETTINGS.livePanels) if (!panels.some((x) => x.id === p.id)) panels.push(p);
    return { ...DEFAULT_SETTINGS, ...saved, livePanels: panels };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setSettings(load());
      setReady(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable (private mode): settings last for this visit only
      }
      return next;
    });
  }, []);

  // Theme and accent colour live on <html> so CSS tokens pick them up.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute("data-cb", settings.colourBlind);
    root.toggleAttribute("data-reduce-motion", settings.reduceMotion);
  }, [settings.colourBlind, settings.reduceMotion]);

  useEffect(() => {
    const root = document.documentElement;
    const colour = settings.teamAccent && settings.favouriteTeamColour ? `#${settings.favouriteTeamColour}` : null;
    if (colour) {
      root.style.setProperty("--accent", colour);
      root.style.setProperty("--accent-ink", readableInk(colour));
    } else {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-ink");
    }
  }, [settings.teamAccent, settings.favouriteTeamColour]);

  const value = useMemo(() => ({ settings, update, ready }), [settings, update, ready]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);

// Black or white, whichever reads better on the given colour.
export function readableInk(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#111111" : "#ffffff";
}
