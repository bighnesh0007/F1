// Shapes of the account and game API.

export type User = {
  id: string;
  handle: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  points: number;
  profile: {
    team?: string | null;
    driver?: string | null;
    driverName?: string | null;
    country?: string | null;
    fanSince?: number | null;
    bio?: string | null;
    quizResult?: string | null;
  };
  settings: Record<string, unknown> | null;
  stats: { picks?: number; correct?: number; points?: number; bestPick?: number };
  createdAt: string;
  google: { linked: boolean; calendar: boolean };
};

export type Badge = { id: string; title: string; description: string; earned: boolean };

export type MarketOption = { id: string; label: string; code?: string; team?: string; points: number };
export type Market = { key: string; title: string; hint: string; lockAt: string; team?: string; options: MarketOption[] };
export type Markets = { season: number; round: number; name: string; markets: Market[] };

export type Prediction = {
  _id: string;
  season: number;
  round: number;
  race: string;
  market: string;
  marketTitle: string;
  pick: string;
  pickLabel: string;
  points: number;
  status: "open" | "correct" | "wrong" | "void";
  earned?: number;
  lockAt: string;
};

export type LeaderboardEntry = { handle: string; displayName: string; avatarUrl: string | null; team: string | null; points: number; correct: number; picks: number };
export type TribeScore = { team: string; fans: number; points: number; average: number };
export type League = { code: string; name: string; members: number; owner: boolean };
