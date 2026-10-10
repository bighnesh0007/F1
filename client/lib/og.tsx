import { ImageResponse } from "next/og";
import { teamById } from "@/lib/teams";

// Social share images (1200x630), drawn on the server with next/og.
export const serverUrl = () => process.env.SERVER_URL || "http://localhost:4000";

export async function serverJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${serverUrl()}${path}`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export function card({ eyebrow, title, subtitle, badge, team, footer }: { eyebrow: string; title: string; subtitle: string; badge?: string; team?: string | null; footer: string }) {
  const colour = `#${teamById(team)?.colour ?? "e10600"}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: `linear-gradient(135deg, ${colour} 0%, #17151a 55%, #0e0d10 100%)`, color: "#f4f2ef", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", background: "#e10600", color: "#fff", fontWeight: 800, fontSize: 30, padding: "6px 14px", borderRadius: 12 }}>F1</div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>Live</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", fontSize: 30, opacity: 0.85 }}>{eyebrow}</div>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, lineHeight: 1.05 }}>{title}</div>
          <div style={{ display: "flex", fontSize: 34, opacity: 0.85 }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 28, opacity: 0.75 }}>{footer}</div>
          {badge && <div style={{ display: "flex", background: "#f4f2ef", color: "#0e0d10", fontSize: 40, fontWeight: 800, padding: "10px 24px", borderRadius: 18 }}>{badge}</div>}
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
