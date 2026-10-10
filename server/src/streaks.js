// Weekend streaks: consecutive race weekends with at least one prediction.
import { mongo } from './db/mongo.js';

// `key` orders weekends (season * 100 + round).
export function nextStreak(streak, key) {
  if (!streak?.last) return { current: 1, best: Math.max(1, streak?.best ?? 0), last: key };
  if (key === streak.last) return streak;
  const consecutive = key === streak.last + 1 || (Math.floor(key / 100) === Math.floor(streak.last / 100) + 1 && key % 100 === 1);
  const current = consecutive ? streak.current + 1 : 1;
  return { current, best: Math.max(streak.best ?? 0, current), last: key };
}

export async function recordWeekendPlayed(user, season, round) {
  const key = Number(season) * 100 + Number(round);
  if (user.stats?.streak?.last >= key) return;
  await mongo().collection('users').updateOne({ _id: user._id }, { $set: { 'stats.streak': nextStreak(user.stats?.streak, key) } });
}

