"use client";

import { useEffect } from "react";
import { api, useAuth } from "@/lib/auth";

// Counts a live session as watched (towards the "Regular" badge) after 5 minutes in
// the race centre, once per session.
export function useWatchedCheckIn(sessionPath: string | null | undefined) {
  const { user } = useAuth();
  const signedIn = Boolean(user);
  useEffect(() => {
    if (!signedIn || !sessionPath) return;
    const key = `f1live.watched:${sessionPath}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {}
    const id = setTimeout(() => {
      api<{ counted: boolean }>("/api/me/watched", { method: "POST" })
        .then((r) => {
          if (r.counted) sessionStorage.setItem(key, "1");
        })
        .catch(() => {});
    }, 5 * 60_000);
    return () => clearTimeout(id);
  }, [signedIn, sessionPath]);
}
