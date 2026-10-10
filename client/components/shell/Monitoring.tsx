"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { report, reportError } from "@/lib/report";

// Reports uncaught browser errors and Core Web Vitals to the server, and registers the
// service worker.
export function Monitoring() {
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
