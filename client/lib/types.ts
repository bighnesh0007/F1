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
  order: [number, string, number][];
  laps: [number, number, number | null][];
  trackStatus: [number, string, string][];
  raceControl: { t: number; message: string; flag: string | null; category: string; lap: number | null }[];
};
