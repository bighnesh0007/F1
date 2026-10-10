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
  stats: { picks?: number; correct?: number; points?: number; bestPick?: number; streak?: { current: number; best: number }; fantasy?: number; quizWeeks?: number };
  followers?: number;
  following?: number;
  createdAt: string;
  google: { linked: boolean; calendar: boolean };
  wallet?: string | null;
  pro?: boolean;
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

export type LeaderboardEntry = { handle: string; displayName: string; avatarUrl: string | null; team: string | null; points: number; correct: number; picks: number; streak?: number; me?: boolean };
export type TribeScore = { team: string; fans: number; points: number; average: number };
export type League = { code: string; name: string; members: number; owner: boolean };

export type FantasyDriver = { id: string; code: string; name: string; team: string; teamId: string; price: number };
export type FantasyTeam = { id: string; name: string; price: number };
export type FantasyPick = { drivers: string[]; constructors: string[]; captain: string; cost: number; status: "open" | "scored"; score: number | null; breakdown: Record<string, number> | null };
export type FantasyMarket = { season: number; round: number; name: string; lockAt: string; budget: number; drivers: FantasyDriver[]; constructors: FantasyTeam[]; myTeam: FantasyPick | null };
export type FantasyHistory = FantasyPick & { season: number; round: number; carried?: boolean };
export type FantasyEntry = { handle: string; displayName: string; avatarUrl: string | null; team: string | null; points: number; rounds: number; best: number };

export type QuizQuestion = { text: string; options: string[]; answer?: string; yours?: string | null };
export type Quiz = { week: string; questions: QuizQuestion[]; result: { correct: number; points: number } | null };

export type ChatUser = { handle: string; displayName: string; avatarUrl: string | null; team: string | null };
export type ChatMessage = { id: string; room: string; text: string | null; hidden: boolean; at: string; user: ChatUser };

export type PollOption = { id: string; label: string; name: string; colour: string | null };
export type Poll = { id: string; kind: "winner" | "dotd"; question: string; open: boolean; options: PollOption[]; results: Record<string, number>; total: number; myVote: string | null };

export type FeedItem = { user: LeaderboardEntry; race: string; season: number; round: number; market: string; pick: string; points: number; status: Prediction["status"]; earned: number; at: string };
