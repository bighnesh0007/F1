"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { report, reportError } from "@/lib/report";
import { useSettings } from "@/lib/settings";
import { syncPush } from "@/lib/push";
import { pushPrefs } from "./PushSettings";

// Reports uncaught browser errors and Core Web Vitals to the server, and registers the
// service worker.
export function Monitoring() {
  const { settings, ready } = useSettings();
  // Keep the server's copy of the notification choices current (e.g. a new favourite).
  const prefs = JSON.stringify(pushPrefs(settings));
  useEffect(() => {
    if (!ready || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const p = JSON.parse(prefs);
    if (!p.sessions && !p.flags && !p.driver) return;
    const id = setTimeout(() => syncPush(p).catch(() => {}), 1500);
    return () => clearTimeout(id);
  }, [prefs, ready]);

  useReportWebVitals((metric) => {
    report({ kind: "vital", name: metric.name, value: metric.value, page: location.pathname });
  });
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportError(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason);
    // Offline support and push notifications (production builds only, so development
    // never serves stale code).
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
