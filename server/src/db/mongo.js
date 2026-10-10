// MongoDB: app profiles for Clerk users, predictions and leagues.
// Works with a local container (docker compose) or MongoDB Atlas (set MONGODB_URI).
import { MongoClient } from 'mongodb';

let db = null;

export async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('MongoDB: MONGODB_URI not set, profiles and predictions are disabled');
    return null;
  }
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000, appName: 'f1-live' });
  for (let attempt = 1; ; attempt++) {
    try {
      await client.connect();
      break;
    } catch (err) {
      if (attempt >= 10) {
        console.error('MongoDB: could not connect, profiles and predictions are disabled:', err.message);
        return null;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  db = client.db(process.env.MONGODB_DB || 'f1live');
  await Promise.all([
    db.collection('users').createIndex({ clerkId: 1 }, { unique: true }),
    db.collection('users').createIndex({ handle: 1 }, { unique: true }),
    db.collection('users').createIndex({ points: -1 }),
    db.collection('predictions').createIndex({ userId: 1, season: 1, round: 1, market: 1 }, { unique: true }),
    db.collection('predictions').createIndex({ status: 1, season: 1, round: 1 }),
    db.collection('leagues').createIndex({ code: 1 }, { unique: true }),
    db.collection('leagues').createIndex({ members: 1 }),
  ]);
  console.log('MongoDB: connected');
  return db;
}

export function mongo() {
  if (!db) throw Object.assign(new Error('Profiles are not available: the database is not configured'), { status: 503 });
  return db;
}

export const mongoReady = () => db != null;
