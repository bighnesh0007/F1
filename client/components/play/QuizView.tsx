"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { api, useAuth } from "@/lib/auth";
import { clerkEnabled } from "@/lib/clerk";
import { useApi } from "@/lib/useApi";
import type { Quiz } from "@/lib/types-user";
import { Card, Skeleton, cn } from "@/components/ui";
import { SignInCta } from "@/components/account/ClerkControls";

export function QuizView() {
  const [version, setVersion] = useState(0);
  const { data, error } = useApi<Quiz>(`/api/game/quiz?v=${version}`, { keepPrevious: true });
  const { user, refresh } = useAuth();
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (error && !data) return <Card><p className="text-sm text-muted">{error}</p></Card>;
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  const done = data.result != null;
  const ready = data.questions.every((_, i) => answers[i] != null);

  const submit = async () => {
    setSending(true);
    setMessage(null);
    try {
      await api("/api/game/quiz", { method: "POST", body: { answers } });
      setVersion((v) => v + 1);
      refresh?.();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-xs font-semibold text-muted">Weekly quiz · {data.week.replace("-W", ", week ")}</p>
        <p className="font-display text-2xl font-bold">How well do you know F1 history?</p>
        <p className="text-sm text-muted">Five questions from real race results, new every Monday. 10 points per right answer, 10 extra for a perfect score.</p>
        {done && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 font-semibold">
            <Sparkles size={16} className="text-accent" /> You got {data.result!.correct} of {data.questions.length} right: +{data.result!.points} points.
          </p>
        )}
      </Card>

      <ol aria-label="Questions" className="space-y-3">
        {data.questions.map((q, i) => (
          <li key={i}>
            <Card>
              <p className="mb-3 font-semibold">
                <span className="mr-2 text-muted">{i + 1}.</span>
                {q.text}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {q.options.map((o) => {
                  const chosen = done ? q.yours === o : answers[i] === o;
                  const right = done && q.answer === o;
                  const wrong = done && chosen && !right;
                  return (
                    <button
                      key={o}
                      disabled={done}
                      aria-pressed={chosen}
                      onClick={() => setAnswers((a) => Object.assign([...a], { [i]: o }))}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm font-medium",
                        right ? "border-good bg-good/15" : wrong ? "border-bad bg-bad/10" : chosen ? "border-accent bg-accent/10" : "border-line hover:bg-surface-2",
                      )}
                    >
                      {o}
                      {right && <Check size={15} className="text-good" />}
                      {wrong && <X size={15} className="text-bad" />}
                    </button>
                  );
                })}
              </div>
            </Card>
          </li>
        ))}
      </ol>

      {!done && (
        <Card>
          {message && <p role="alert" className="mb-3 text-sm text-bad">{message}</p>}
          {user ? (
            <button onClick={submit} disabled={!ready || sending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-ink disabled:opacity-40">
              {sending && <Loader2 size={16} className="animate-spin" />} Submit answers
            </button>
          ) : clerkEnabled ? (
            <SignInCta />
          ) : (
            <p className="text-sm text-muted">Sign-in isn&apos;t set up on this server yet.</p>
          )}
        </Card>
      )}
    </div>
  );
}
