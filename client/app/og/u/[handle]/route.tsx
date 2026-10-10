import { card, serverJson } from "@/lib/og";
import { teamById } from "@/lib/teams";

type Profile = { displayName: string; handle: string; points: number; stats: { picks: number; correct: number }; profile: { team: string | null }; badges: unknown[]; streak?: number };

// Share image for a fan profile.
export async function GET(_req: Request, ctx: RouteContext<"/og/u/[handle]">) {
  const { handle } = await ctx.params;
  const p = await serverJson<Profile>(`/api/users/${encodeURIComponent(handle)}`);
  if (!p) return new Response("Not found", { status: 404 });
  const team = teamById(p.profile.team);
  return card({
    eyebrow: team ? `${team.tribe} · ${team.name}` : "F1 fan",
    title: p.displayName,
    subtitle: `${p.stats.correct}/${p.stats.picks} correct calls · ${p.badges.length} badges${p.streak ? ` · ${p.streak}-weekend streak` : ""}`,
    badge: `${p.points.toLocaleString("en")} pts`,
    team: p.profile.team,
    footer: `@${p.handle} on F1 Live`,
  });
}
