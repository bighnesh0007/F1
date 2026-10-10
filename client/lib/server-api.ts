import "server-only";
import { connection } from "next/server";

const serverUrl = () => process.env.SERVER_URL || "http://localhost:4000";

// Fetches public API data on the server for seeding the page. Slow or failing
// requests are skipped (the browser fetches them instead) so they never block a page.
export async function fetchSeed(paths: string[], timeoutMs = 2500) {
  await connection();
  const entries = await Promise.all(
    paths.map(async (path) => {
      try {
        const res = await fetch(`${serverUrl()}${path}`, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
        return res.ok ? ([path, await res.json()] as const) : null;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter((e) => e !== null));
}
