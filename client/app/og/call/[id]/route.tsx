import { card, serverJson } from "@/lib/og";

type Call = { race: string; season: number; market: string; pick: string; earned: number; user: { displayName: string; team: string | null } | null };

// Share image for a correct prediction: "I called it!"
export async function GET(_req: Request, ctx: RouteContext<"/og/call/[id]">) {
  const { id } = await ctx.params;
  const call = await serverJson<Call>(`/api/game/calls/${encodeURIComponent(id)}`);
  if (!call) return new Response("Not found", { status: 404 });
  return card({
    eyebrow: `${call.user?.displayName ?? "A fan"} called it`,
    title: call.pick,
    subtitle: `${call.market} · ${call.season} ${call.race}`,
    badge: `+${call.earned} pts`,
    team: call.user?.team,
    footer: "Predict every race on F1 Live",
  });
}
