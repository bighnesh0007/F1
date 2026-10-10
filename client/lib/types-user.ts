// Shapes of the account and game API.

export type User = {
  id: string;
  handle: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  coins: number;
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
  stats: { bets?: number; won?: number; staked?: number; returned?: number; biggestStake?: number };
  createdAt: string;
  hasPassword: boolean;
  google: { linked: boolean; calendar: boolean };
  lastDailyBonus: string | null;
};

export type Badge = { id: string; title: string; description: string; earned: boolean };

export type MarketOption = { id: string; label: string; code?: string; team?: string; odds: number };
export type Market = { key: string; title: string; hint: string; lockAt: string; team?: string; options: MarketOption[] };
export type Markets = { season: number; round: number; name: string; markets: Market[] };

export type Bet = {
  _id: string;
  season: number;
  round: number;
  race: string;
  market: string;
  marketTitle: string;
  pick: string;
  pickLabel: string;
  odds: number;
  stake: number;
  status: "open" | "won" | "lost" | "void";
  payout?: number;
  lockAt: string;
  createdAt: string;
};

export type LeaderboardEntry = { handle: string; displayName: string; avatarUrl: string | null; team: string | null; coins: number; profit: number; won: number; bets: number };
export type League = { code: string; name: string; members: number; owner: boolean };
export type LedgerEntry = { _id: string; amount: number; type: string; note: string; at: string };
