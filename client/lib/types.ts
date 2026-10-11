// Shapes of the server's JSON API.

export type Circuit = { id: string; name: string; locality: string; country: string; lat: number; lon: number };

export type ScheduleSession = { key: string; name: string; start: string };

export type Race = {
  season: number;
  round: number;
  name: string;
  circuit: Circuit;
  date: string;
  sprint: boolean;
  sessions: ScheduleSession[];
};

export type Weekend = {
  current: (Race & { circuitKey: number | null }) | null;
  previous: Race | null;
  remaining: Race[];
  totalRounds: number;
};

export type JDriver = {
  id: string;
  code: string;
  number: string | null;
  firstName: string;
  lastName: string;
  name: string;
  nationality: string;
};

export type Result = {
  position: number;
  positionText: string;
  number: string;
  driver: JDriver;
  team: string;
  teamId: string;
  grid: number;
  laps: number;
  status: string;
  points: number;
  time: string | null;
  fastestLap: { rank: number; lap: number; time: string } | null;
};

export type Standings = {
  season: string | null;
  round: number | null;
  drivers: { position: number | null; points: number; wins: number; driver: JDriver; team: string; teamId: string }[];
  constructors: { position: number | null; points: number; wins: number; team: string; teamId: string; nationality: string }[];
};

export type SeasonRound = {
  round: number;
  name: string;
  circuit: Circuit;
  date: string;
  results?: Result[];
  sprint?: Result[];
  qualifying?: { position: number; driver: JDriver; team: string; teamId: string; q1: string | null; q2: string | null; q3: string | null }[];
};

export type RaceDetail = {
  season: number;
  round: number;
  name: string;
  circuit: Circuit;
  date: string;
  results: Result[];
  positions: Record<string, number[]>;
  lapTimes: Record<string, string[]>;
  pitStops: { driverId: string; lap: number; stop: number; duration: string }[];
};

export type CircuitHistory = {
  firstRace: number | null;
  races: number;
  winners: { season: number; name: string; driver: JDriver; team: string; time: string | null }[];
  mostWins: (JDriver & { count: number })[];
  lapRecord: { time: string; season: number; driver: JDriver; team: string } | null;
};

export type CircuitMap = {
  source: "multiviewer" | "outline";
  name: string;
  x: number[];
  y: number[];
  time: number[] | null;
  rotation: number;
  startsAtFinish: boolean;
  corners: { number: number; letter: string; x: number; y: number; angle: number }[];
  length?: number;
};

export type Records = {
  wins: (JDriver & { count: number })[];
  poles: (JDriver & { count: number })[];
  fastestLaps: (JDriver & { count: number })[];
  championships: (JDriver & { count: number })[];
  champions: { season: number; driver: JDriver; team: string; points: number }[];
  championsComplete: boolean;
  totalRaces: number;
  polesSince: number | null;
  fastestLapsSince: number | null;
};

export type SeasonSummary = {
  season: number;
  races: number;
  completed: number;
  champion: Standings["drivers"][number] | null;
  constructorChampion: Standings["constructors"][number] | null;
  topDrivers: Standings["drivers"];
  topConstructors: Standings["constructors"];
  differentWinners: number;
  winsByDriver: (JDriver & { team: string; count: number })[];
  winsByTeam: { id: string; name: string; count: number }[];
};

export type ArchivedSession = {
  key: number;
  name: string;
  type: string;
  path: string;
  start: string;
  end: string;
  meeting: string;
  location: string;
  country: string;
  circuitKey: number;
};

export type Replay = {
  path: string;
  meeting: string;
  session: string;
  type: string;
  circuitKey: number | null;
  location: string;
  stepMs: number;
  startUtc: string | null;
  drivers: { number: string; tla: string; fullName: string; team: string; teamColour: string; headshot: string | null }[];
  frames: (number | null)[][];
  // Board changes over time: [t, driver number, changed fields].
  timing: [number, string, Partial<ReplayBoardRow>][];
  parts: [number, number][]; // qualifying part (1–3) from time t
  cutoffs: number[] | null; // cars in each qualifying part
  clock: [number, number, boolean][]; // [t, remaining ms, counting down]
  laps: [number, number, number | null][];
  trackStatus: [number, string, string][];
  raceControl: { t: number; message: string; flag: string | null; category: string; lap: number | null; driver: string | null }[];
};

export type ReplayBoardRow = {
  p: number | null;
  laps: number;
  best: string | null;
  last: string | null;
  gap: string | null;
  int: string | null;
  pit: boolean;
  stops: number;
  out: boolean;
  stop: boolean;
  ko: boolean;
  q1: string | null;
  q2: string | null;
  q3: string | null;
  grid: number | null;
  tyre: string | null;
  fresh: boolean;
  tyreLaps: number | null;
};

export type DriverCareer = {
  driver: { id: string; code?: string; name: string; nationality: string; number: string | null; dateOfBirth: string | null; url: string | null };
  totals: { seasons: number; races: number; wins: number; podiums: number; poles: number; points: number; dnfs: number; titles: number; titleYears: number[]; firstRace: { season: number; name: string } | null; firstWin: { season: number; name: string } | null };
  seasons: { season: number; teams: string[]; races: number; wins: number; podiums: number; points: number; best: number | null }[];
  recent: { season: number; round: number; name: string; position: number; positionText: string; grid: number; team: string; points: number; status: string }[];
};

export type TeamHistory = {
  team: { id: string; name: string; nationality: string; url: string | null };
  totals: { seasons: number; firstSeason: number | null; wins: number; poles: number; titles: number; titleYears: number[]; lastWin: { season: number; name: string; driver: { name: string } } | null };
  topWinners: { id: string; name: string; count: number }[];
  winsBySeason: { season: number; wins: number }[];
};

export type NewsItem = { title: string; summary: string; link: string; image: string | null; source: string; publishedAt: string | null };

export type Trip = {
  timezone: string | null;
  utcOffsetSeconds: number | null;
  sunrise: string | null;
  sunset: string | null;
  forecast: { maxTemp: number; minTemp: number; rainChance: number | null; code: number | null } | null;
  climate: { years: number; maxTemp: number; minTemp: number; rainyYears: number } | null;
};
