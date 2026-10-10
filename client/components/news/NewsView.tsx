"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Newspaper } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import type { NewsItem } from "@/lib/types";
import { Card, ErrorNote, Skeleton, cn } from "@/components/ui";
import { TEAMS } from "@/lib/teams";

function ago(iso: string | null, now: number | null) {
  if (!iso || now == null) return "";
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

function NewsRow({ n, now, big }: { n: NewsItem; now: number | null; big?: boolean }) {
  return (
    <a href={n.link} target="_blank" rel="noopener noreferrer" className={cn("group flex gap-3 rounded-xl p-2 hover:bg-surface-2", big && "flex-col")}>
      {n.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={n.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} className={cn("shrink-0 rounded-lg object-cover", big ? "aspect-video w-full" : "h-16 w-24")} />
      )}
      <span className="min-w-0">
        <span className="line-clamp-2 font-semibold group-hover:underline">{n.title}</span>
        {big && n.summary && <span className="mt-1 line-clamp-3 block text-sm text-muted">{n.summary}</span>}
        <span className="mt-0.5 flex items-center gap-1 text-xs text-faint">
          {n.source} · {ago(n.publishedAt, now)} <ExternalLink size={11} />
        </span>
      </span>
    </a>
  );
}

// The news page: latest headlines, filterable by team.
export function NewsView() {
  const [team, setTeam] = useState<string | null>(null);
  const query = team ? TEAMS.find((t) => t.id === team)?.match.join(",") : "";
  const { data, error } = useApi<NewsItem[]>(`/api/news${query ? `?q=${encodeURIComponent(query)}` : ""}`, { refreshMs: 10 * 60_000, keepPrevious: true });
  const now = useNow(60_000);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold">News</h1>
        <p className="text-sm text-muted">Headlines from Formula1.com, Autosport, Motorsport.com and The Race. Articles open on their site.</p>
      </div>
      <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {[{ id: null, name: "All teams" }, ...TEAMS.map((t) => ({ id: t.id, name: t.name }))].map((t) => (
          <button
            key={t.id ?? "all"}
            onClick={() => setTeam(t.id)}
            aria-pressed={team === t.id}
            className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-semibold", team === t.id ? "border-accent bg-accent/10" : "border-line text-muted hover:text-ink")}
          >
            {t.name}
          </button>
        ))}
      </div>
      {error && !data ? (
        <ErrorNote message={error} />
      ) : !data ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : data.length === 0 ? (
        <p className="py-10 text-center text-muted">No recent headlines{team ? " about this team" : ""}.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((n) => (
            <div key={n.link} className="rounded-2xl border border-line bg-surface shadow-card">
              <NewsRow n={n} now={now} big />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A few headlines in a card (home page, driver and team pages).
export function TeamNews({ query, title = "Latest news", limit = 5 }: { query?: string; title?: string; limit?: number }) {
  const { data } = useApi<NewsItem[]>(`/api/news${query ? `?q=${encodeURIComponent(query)}` : ""}`, { refreshMs: 15 * 60_000 });
  const now = useNow(60_000);
  if (!data?.length) return null;
  return (
    <Card title={title} icon={<Newspaper size={15} />} right={<Link href="/news" className="text-xs font-semibold text-accent">All news →</Link>}>
      <ul className="space-y-1">
        {data.slice(0, limit).map((n) => (
          <li key={n.link}>
            <NewsRow n={n} now={now} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
