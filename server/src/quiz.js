// Weekly F1 quiz: five questions from real race history (Jolpica), the same for
// everyone that week. 10 points per right answer and 10 extra for a perfect score,
// added to your points. One attempt per week.
import crypto from 'node:crypto';
import express from 'express';
import { mongo } from './db/mongo.js';
import { HttpError } from './auth.js';
import { cached, DAY } from './http.js';
import * as jolpica from './jolpica.js';

export const QUESTIONS = 5;
export const POINTS_EACH = 10;
export const PERFECT_BONUS = 10;
const FIRST_YEAR = Number(process.env.QUIZ_FIRST_YEAR) || 1990;

// ISO week, e.g. "2026-W41".
export function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Deterministic random numbers from the week, so everyone gets the same quiz.
export function rng(seed) {
  let h = crypto.createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
function shuffle(r, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const unique = (list) => [...new Set(list.filter(Boolean))];

// One question from a race, or null if the data doesn't allow that kind.
export function makeQuestion(r, kind, year, race) {
  const res = race.results ?? [];
  const label = `the ${year} ${race.name}`;
  const options = (answer, pool) => {
    const wrong = shuffle(r, unique(pool).filter((x) => x !== answer)).slice(0, 3);
    return wrong.length === 3 ? shuffle(r, [answer, ...wrong]) : null;
  };
  if (kind === 'winner' && res.length >= 6) {
    const answer = res[0].driver.name;
    const opts = options(answer, res.slice(1, 10).map((x) => x.driver.name));
    return opts && { text: `Who won ${label}?`, options: opts, answer };
  }
  if (kind === 'pole' && race.qualifying?.length >= 6) {
    const answer = race.qualifying[0].driver.name;
    const opts = options(answer, race.qualifying.slice(1, 10).map((x) => x.driver.name));
    return opts && { text: `Who took pole position for ${label}?`, options: opts, answer };
  }
  if (kind === 'team' && res.length >= 6) {
    const who = pick(r, res.slice(0, 6));
    const answer = who.team;
    const opts = options(answer, res.map((x) => x.team));
    return opts && { text: `Which team did ${who.driver.name} drive for at ${label}?`, options: opts, answer };
  }
  if (kind === 'podium' && res.length >= 10) {
    const answer = pick(r, res.slice(0, 3)).driver.name;
    const opts = options(answer, res.slice(4, 14).map((x) => x.driver.name));
    return opts && { text: `Which of these drivers finished on the podium at ${label}?`, options: opts, answer };
  }
  if (kind === 'fastest' && res.some((x) => x.fastestLap?.rank === 1)) {
    const answer = res.find((x) => x.fastestLap?.rank === 1).driver.name;
    const opts = options(answer, res.slice(0, 10).map((x) => x.driver.name));
    return opts && { text: `Who set the fastest lap at ${label}?`, options: opts, answer };
  }
  return null;
}

export function getQuiz(week = weekKey()) {
  return cached(`quiz:${week}`, DAY, async () => {
    const r = rng(`f1-quiz:${week}`);
    const lastYear = new Date().getUTCFullYear() - 1;
    const kinds = shuffle(r, ['winner', 'pole', 'team', 'podium', 'fastest', 'winner', 'team']);
    const questions = [];
    for (let attempt = 0; questions.length < QUESTIONS && attempt < 25; attempt++) {
      const year = FIRST_YEAR + Math.floor(r() * (lastYear - FIRST_YEAR + 1));
      const season = await jolpica.getSeasonResults(year).catch(() => []);
      const withResults = season.filter((x) => x.results?.length);
      if (!withResults.length) continue;
      const q = makeQuestion(r, kinds[questions.length % kinds.length], year, pick(r, withResults));
      if (q && !questions.some((x) => x.text === q.text)) questions.push(q);
    }
    if (questions.length < QUESTIONS) throw new HttpError(503, "This week's quiz isn't ready yet, try again in a minute");
    return { week, questions };
  });
}

export function quizRouter(requireUser) {
  const router = express.Router();
  const attempts = () => mongo().collection('quizAttempts');

  router.get('/', async (req, res) => {
    const quiz = await getQuiz();
    const mine = req.user ? await attempts().findOne({ userId: req.user._id, week: quiz.week }) : null;
    res.json({
      week: quiz.week,
      questions: quiz.questions.map((q, i) => ({ text: q.text, options: q.options, ...(mine ? { answer: q.answer, yours: mine.answers[i] } : {}) })),
      result: mine ? { correct: mine.correct, points: mine.points } : null,
    });
  });

  router.post('/', requireUser, async (req, res) => {
    const quiz = await getQuiz();
    const answers = Array.isArray(req.body?.answers) ? req.body.answers.slice(0, QUESTIONS).map((a) => (a == null ? null : String(a))) : [];
    if (answers.length !== QUESTIONS) throw new HttpError(400, 'Answer every question');
    const correct = quiz.questions.filter((q, i) => q.answer === answers[i]).length;
    const points = correct * POINTS_EACH + (correct === QUESTIONS ? PERFECT_BONUS : 0);
    try {
      await attempts().insertOne({ userId: req.user._id, week: quiz.week, answers, correct, points, createdAt: new Date() });
    } catch (err) {
      if (err.code === 11000) throw new HttpError(400, "You've already played this week's quiz");
      throw err;
    }
    await mongo()
      .collection('users')
      .updateOne({ _id: req.user._id }, { $inc: { points, 'stats.quizPoints': points, 'stats.quizWeeks': 1, 'stats.quizPerfect': correct === QUESTIONS ? 1 : 0 } });
    res.json({ correct, points, answers: quiz.questions.map((q) => q.answer) });
  });

  return router;
}
