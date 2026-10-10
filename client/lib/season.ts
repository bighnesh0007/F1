import type { JDriver, SeasonRound } from "./types";

export type TeammateBattle = {
  teamId: string;
  team: string;
  a: JDriver;
  b: JDriver;
  race: [number, number]; // races where each finished ahead
  quali: [number, number];
  points: [number, number];
  rounds: number;
};

// Head-to-head between teammates across a season: who finished ahead in races and
// qualifying, and points (including sprints). Only pairs that raced together count.
export function teammateBattles(rounds: SeasonRound[]): TeammateBattle[] {
  const battles = new Map<string, TeammateBattle>();
  const key = (teamId: string, x: string, y: string) => `${teamId}:${[x, y].sort().join("|")}`;
  const get = (teamId: string, team: string, x: JDriver, y: JDriver) => {
    const [a, b] = [x, y].sort((p, q) => p.id.localeCompare(q.id));
    const k = key(teamId, a.id, b.id);
    if (!battles.has(k)) battles.set(k, { teamId, team, a, b, race: [0, 0], quali: [0, 0], points: [0, 0], rounds: 0 });
    return battles.get(k)!;
  };

  for (const round of rounds) {
    const byTeam = new Map<string, NonNullable<SeasonRound["results"]>>();
    for (const r of round.results ?? []) byTeam.set(r.teamId, [...(byTeam.get(r.teamId) ?? []), r]);
    for (const [teamId, rs] of byTeam) {
      if (rs.length !== 2) continue;
      const battle = get(teamId, rs[0].team, rs[0].driver, rs[1].driver);
      const ia = rs.findIndex((r) => r.driver.id === battle.a.id);
      const ra = rs[ia];
      const rb = rs[1 - ia];
      battle.rounds++;
      if (ra.position < rb.position) battle.race[0]++;
      else battle.race[1]++;
      battle.points[0] += ra.points;
      battle.points[1] += rb.points;
    }
    for (const s of round.sprint ?? []) {
      for (const battle of battles.values()) {
        if (s.driver.id === battle.a.id) battle.points[0] += s.points;
        if (s.driver.id === battle.b.id) battle.points[1] += s.points;
      }
    }
    const qByTeam = new Map<string, NonNullable<SeasonRound["qualifying"]>>();
    for (const q of round.qualifying ?? []) qByTeam.set(q.teamId, [...(qByTeam.get(q.teamId) ?? []), q]);
    for (const [teamId, qs] of qByTeam) {
      if (qs.length !== 2) continue;
      const battle = get(teamId, qs[0].team, qs[0].driver, qs[1].driver);
      const ia = qs.findIndex((q) => q.driver.id === battle.a.id);
      if (qs[ia].position < qs[1 - ia].position) battle.quali[0]++;
      else battle.quali[1]++;
    }
  }
  return [...battles.values()].filter((b) => b.rounds > 0).sort((x, y) => y.points[0] + y.points[1] - (x.points[0] + x.points[1]));
}

export function driverSeason(rounds: SeasonRound[], code: string) {
  const results = rounds.flatMap((r) => (r.results ?? []).filter((x) => x.driver.code === code).map((x) => ({ ...x, round: r.round, race: r.name })));
  return {
    starts: results.length,
    wins: results.filter((r) => r.position === 1).length,
    podiums: results.filter((r) => r.position <= 3).length,
    poles: rounds.filter((r) => r.qualifying?.[0]?.driver.code === code).length,
    bestFinish: results.length ? Math.min(...results.map((r) => r.position)) : null,
    dnfs: results.filter((r) => !/finished|lap/i.test(r.status)).length,
    recent: results.slice(-5),
  };
}
