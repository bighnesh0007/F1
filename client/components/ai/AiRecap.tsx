"use client";

import { Sparkles } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Card, Skeleton } from "@/components/ui";

export function useAiStatus() {
  const { data } = useApi<{ enabled: boolean; live: boolean }>("/api/ai/status");
  return data;
}

// A written recap of a finished race, by the AI analyst.
export function AiRecap({ season, round }: { season: number; round: number }) {
  const status = useAiStatus();
  const { data, error } = useApi<{ text: string }>(status?.enabled ? `/api/ai/recap/${season}/${round}` : null);
  if (!status?.enabled || (error && !data)) return null;
  return (
    <Card title="Race recap" icon={<Sparkles size={15} />} right={<span className="text-[11px] text-faint">Written by AI from the results</span>}>
      {!data ? <Skeleton className="h-28" /> : <div className="space-y-2 text-[15px] leading-relaxed">{data.text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>}
    </Card>
  );
}
