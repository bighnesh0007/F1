import type { Replay, ReplayBoardRow } from "@/lib/types";

export type SessionKind = "race" | "sprint" | "quali" | "sprintQuali" | "practice";

export function kindOf(replay: Pick<Replay, "type" | "session">): SessionKind {
  const sprint = /sprint/i.test(replay.session ?? "");
  if (replay.type === "Race") return sprint ? "sprint" : "race";
  if (replay.type === "Qualifying" || /qualifying|shootout/i.test(replay.session ?? "")) return sprint ? "sprintQuali" : "quali";
  return "practice";
}

export const EMPTY_ROW: ReplayBoardRow = {
  p: null, laps: 0, best: null, last: null, gap: null, int: null, pit: false, stops: 0, out: false, stop: false,
  ko: false, q1: null, q2: null, q3: null, grid: null, tyre: null, fresh: false, tyreLaps: null,
};

export type Board = Record<string, ReplayBoardRow>;

const CHECKPOINT_MS = 30_000;

// Snapshots of the board every 30 s of session time, so the board at any moment
// is a snapshot plus the few changes after it (cheap while scrubbing).
export function buildCheckpoints(replay: Replay) {
  const board: Board = Object.fromEntries(replay.drivers.map((d) => [d.number, { ...EMPTY_ROW }]));
  const checkpoints: { index: number; board: Board }[] = [];
  let next = 0;
  replay.timing.forEach(([t, n, change], index) => {
    while (t >= next) {
      checkpoints.push({ index, board: clone(board) });
      next += CHECKPOINT_MS;
    }
    board[n] = { ...(board[n] ?? EMPTY_ROW), ...change };
  });
  checkpoints.push({ index: replay.timing.length, board: clone(board) });
  return checkpoints;
}

export function boardAt(replay: Replay, checkpoints: ReturnType<typeof buildCheckpoints>, t: number): Board {
  const cp = checkpoints[Math.min(Math.floor(t / CHECKPOINT_MS), checkpoints.length - 1)] ?? checkpoints[0];
  const board = clone(cp.board);
  for (let i = cp.index; i < replay.timing.length; i++) {
    const [rt, n, change] = replay.timing[i];
    if (rt > t) break;
    board[n] = { ...(board[n] ?? EMPTY_ROW), ...change };
  }
  return board;
}

function clone(board: Board): Board {
  const out: Board = {};
  for (const k in board) out[k] = { ...board[k] };
  return out;
}

// When each driver first shows as retired or stopped (for the map markers).
export function retirements(replay: Replay) {
  const at = new Map<string, number>();
  for (const [t, n, change] of replay.timing) if ((change.out || change.stop) && !at.has(n)) at.set(n, t);
  return at;
}

// "1:31.234" or "31.234" → milliseconds.
export function lapMs(value: string | null | undefined) {
  if (!value) return null;
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(value.trim());
  return m ? (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000 : null;
}

export function gapText(ms: number | null, best: number | null) {
  if (ms == null || best == null) return "";
  return ms === best ? "" : `+${((ms - best) / 1000).toFixed(3)}`;
}

export function lastBefore<T extends [number, ...unknown[]]>(rows: T[], t: number): T | undefined {
  let found: T | undefined;
  for (const row of rows) {
    if (row[0] > t) break;
    found = row;
  }
  return found;
}

// Time left on the session clock at t.
export function remainingAt(replay: Replay, t: number) {
  const c = lastBefore(replay.clock ?? [], t);
  if (!c) return null;
  return c[2] ? Math.max(0, c[1] - (t - c[0])) : c[1];
}

// How many cars go through from each qualifying part.
export function advancing(replay: Replay, part: number) {
  const fromFeed = replay.cutoffs?.[part];
  if (fromFeed) return fromFeed;
  const n = replay.drivers.length;
  if (part === 1) return n - (n > 20 ? 6 : 5);
  if (part === 2) return 10;
  return null;
}
