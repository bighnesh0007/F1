// Sends browser errors and page-speed numbers to the server (POST /api/report), where
// they are logged and summarised. Best effort: never throws, never blocks the page.
type Report = { kind: "error"; message: string; stack?: string; page: string } | { kind: "vital"; name: string; value: number; page: string };

let sent = 0;

export function report(r: Report) {
  if (typeof window === "undefined" || sent++ > 40) return; // cap per page view
  try {
    const body = new Blob([JSON.stringify(r)], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/report", body)) {
      fetch("/api/report", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {}
}

export function reportError(error: unknown) {
  const e = error instanceof Error ? error : new Error(String(error));
  report({ kind: "error", message: e.message, stack: e.stack, page: location.pathname });
}
