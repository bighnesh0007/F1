"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report";

// Last-resort screen when the whole app fails to render.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError(error), [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#0e0d10", color: "#f5f3ef", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 16 }}>
          <h1 style={{ fontSize: 24 }}>F1 Live hit a problem</h1>
          <p style={{ opacity: 0.7 }}>It has been reported.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 12, border: 0, background: "#e10600", color: "#fff", fontWeight: 600 }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
