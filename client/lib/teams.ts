// Team "tribes" for fan profiles. Colours are fallbacks; live team colours from the
// timing feed are used where available.

export type Team = { id: string; name: string; tribe: string; colour: string; vibe: string; match: string[] };

export const TEAMS: Team[] = [
  { id: "ferrari", name: "Ferrari", tribe: "Tifosi", colour: "E8002D", vibe: "Passion, history and heartbreak, all at full volume.", match: ["ferrari"] },
  { id: "mclaren", name: "McLaren", tribe: "Papaya Army", colour: "FF8000", vibe: "Bright, bold and always up for a laugh.", match: ["mclaren"] },
  { id: "mercedes", name: "Mercedes", tribe: "Silver Arrows", colour: "27F4D2", vibe: "Precision, data and a calm plan for everything.", match: ["mercedes"] },
  { id: "red_bull", name: "Red Bull Racing", tribe: "Bull Run", colour: "3671C6", vibe: "Ruthless pace. Second place is the first loser.", match: ["red bull racing", "red bull"] },
  { id: "aston_martin", name: "Aston Martin", tribe: "Green Machine", colour: "229971", vibe: "Style, ambition and a very long game.", match: ["aston martin"] },
  { id: "williams", name: "Williams", tribe: "Grove Faithful", colour: "64C4FF", vibe: "Proud history, plucky underdogs, rising again.", match: ["williams"] },
  { id: "alpine", name: "Alpine", tribe: "Les Bleus", colour: "0093CC", vibe: "French flair and chaotic good energy.", match: ["alpine"] },
  { id: "racing_bulls", name: "Racing Bulls", tribe: "Young Guns", colour: "6692FF", vibe: "Tomorrow's stars, today's surprises.", match: ["racing bulls", "rb", "alphatauri", "visa cash app"] },
  { id: "haas", name: "Haas", tribe: "Garage Grinders", colour: "B6BABD", vibe: "No-nonsense racers punching above their weight.", match: ["haas"] },
  { id: "audi", name: "Audi", tribe: "Four Rings", colour: "F50537", vibe: "German engineering, new chapter, big plans.", match: ["audi", "sauber", "kick", "stake", "alfa romeo"] },
  { id: "cadillac", name: "Cadillac", tribe: "Stars & Stripes", colour: "C9A227", vibe: "The new kids on the grid, here to make noise.", match: ["cadillac"] },
];

export const teamById = (id?: string | null) => TEAMS.find((t) => t.id === id) ?? null;

export const teamForName = (name?: string | null) => {
  const n = String(name ?? "").toLowerCase();
  return TEAMS.find((t) => t.match.some((m) => n.includes(m))) ?? null;
};

// "Which team are you?" — each answer nudges towards a few teams.
export const QUIZ: { q: string; answers: { a: string; teams: string[] }[] }[] = [
  {
    q: "It's race morning. You are…",
    answers: [
      { a: "Already in team kit, flag ready, voice gone from yesterday", teams: ["ferrari", "mclaren"] },
      { a: "Reviewing tyre strategies with a coffee", teams: ["mercedes", "williams"] },
      { a: "Calmly expecting to win. Again.", teams: ["red_bull"] },
      { a: "Hoping for chaos so the midfield can shine", teams: ["haas", "alpine", "racing_bulls"] },
    ],
  },
  {
    q: "Pick a strategy",
    answers: [
      { a: "Undercut early, attack, attack, attack", teams: ["red_bull", "mclaren"] },
      { a: "Long first stint, trust the data", teams: ["mercedes", "aston_martin"] },
      { a: "Whatever the strategist says… then panic on the radio", teams: ["ferrari"] },
      { a: "Gamble on the weather and pray", teams: ["williams", "haas", "alpine"] },
    ],
  },
  {
    q: "Your ideal team-mate dynamic",
    answers: [
      { a: "Best mates, memes and matching outfits", teams: ["mclaren", "williams"] },
      { a: "Clear number one. No discussion.", teams: ["red_bull"] },
      { a: "Respectful rivals pushing each other", teams: ["mercedes", "ferrari"] },
      { a: "Spicy. Very spicy.", teams: ["alpine", "aston_martin"] },
    ],
  },
  {
    q: "What hooks you most about F1?",
    answers: [
      { a: "History, legends and red cars", teams: ["ferrari", "williams"] },
      { a: "Engineering and innovation", teams: ["mercedes", "audi", "aston_martin"] },
      { a: "Young drivers breaking through", teams: ["racing_bulls", "mclaren", "cadillac"] },
      { a: "Underdogs beating the giants", teams: ["haas", "alpine", "williams"] },
    ],
  },
  {
    q: "Choose a track",
    answers: [
      { a: "Monza: the Temple of Speed", teams: ["ferrari"] },
      { a: "Silverstone: fast, flowing, home crowd", teams: ["mclaren", "mercedes", "williams", "aston_martin"] },
      { a: "Las Vegas or Miami: lights and spectacle", teams: ["cadillac", "haas", "red_bull"] },
      { a: "Suzuka or Spa: a proper driver's track", teams: ["red_bull", "racing_bulls", "alpine", "audi"] },
    ],
  },
  {
    q: "Pick a slogan",
    answers: [
      { a: "Forza!", teams: ["ferrari"] },
      { a: "Never give up", teams: ["williams", "haas", "alpine"] },
      { a: "Win at all costs", teams: ["red_bull", "aston_martin"] },
      { a: "The future is now", teams: ["mclaren", "cadillac", "audi", "racing_bulls", "mercedes"] },
    ],
  },
];

export function scoreQuiz(answers: number[]) {
  const scores = new Map<string, number>();
  answers.forEach((choice, i) => {
    const teams = QUIZ[i]?.answers[choice]?.teams ?? [];
    for (const t of teams) scores.set(t, (scores.get(t) ?? 0) + 1 / teams.length);
  });
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mclaren";
}
