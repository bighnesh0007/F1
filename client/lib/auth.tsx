"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSettings, type Settings } from "./settings";
import { clerkEnabled } from "./clerk";
import type { User } from "./types-user";

type AuthCtx = {
  /** The app profile (tribe, points, settings) of the signed-in Clerk user. */
  user: User | null;
  loading: boolean;
  enabled: boolean;
  refresh: () => Promise<void>;
  setUser: (user: User | null) => void;
  /** Called by the Clerk bridge whenever the signed-in Clerk user changes. */
  setClerkUserId: (id: string | null) => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}

// Settings that are synced to the account (everything except purely local state).
const SYNCED: (keyof Settings)[] = ["theme", "teamAccent", "favouriteDriver", "favouriteTeamColour", "spoilerFree", "sounds", "alerts", "flagEffects", "reminders", "reminderMinutes", "livePanels", "colourBlind", "reduceMotion", "language"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [clerkUserId, setClerkUserId] = useState<string | null | undefined>(clerkEnabled ? undefined : null);
  const [loading, setLoading] = useState(clerkEnabled);
  const { settings, update, ready } = useSettings();
  const syncedFor = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api<{ user: User | null }>("/api/auth/me");
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load the app profile whenever the Clerk user changes.
  useEffect(() => {
    if (clerkUserId === undefined) return;
    const id = setTimeout(() => {
      if (clerkUserId) void refresh();
      else {
        setUser(null);
        setLoading(false);
        syncedFor.current = null;
      }
    }, 0);
    return () => clearTimeout(id);
  }, [clerkUserId, refresh]);

  // On sign-in, saved account settings win; a new profile adopts this device's settings.
  useEffect(() => {
    if (!user || !ready || syncedFor.current === user.id) return;
    syncedFor.current = user.id;
    if (user.settings) {
      const saved = Object.fromEntries(SYNCED.filter((k) => k in user.settings!).map((k) => [k, user.settings![k]]));
      update(saved as Partial<Settings>);
    } else {
      void api("/api/profile/settings", { method: "PUT", body: { settings: pick(settings) } }).catch(() => {});
    }
  }, [user, ready, settings, update]);

  // Afterwards, changes are saved to the account (debounced).
  useEffect(() => {
    if (!user || syncedFor.current !== user.id) return;
    const timer = setTimeout(() => {
      void api("/api/profile/settings", { method: "PUT", body: { settings: pick(settings) } }).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [settings, user]);

  const value = useMemo<AuthCtx>(
    () => ({ user, loading, enabled: clerkEnabled, refresh, setUser, setClerkUserId }),
    [user, loading, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function pick(settings: Settings) {
  return Object.fromEntries(SYNCED.map((k) => [k, settings[k]]));
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
