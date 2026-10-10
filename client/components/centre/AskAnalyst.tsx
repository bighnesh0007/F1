"use client";

import { useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { api, useAuth } from "@/lib/auth";
import { clerkEnabled } from "@/lib/clerk";
import { useAiStatus } from "@/components/ai/AiRecap";
import { SignInCta } from "@/components/account/ClerkControls";
import { cn } from "@/components/ui";

type Turn = { q: string; a?: string; error?: string };

// Ask the AI analyst about the live session ("Why did Hamilton pit?").
export function AskAnalyst({ focusName }: { focusName?: string | null }) {
  const status = useAiStatus();
  const { user } = useAuth();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  if (status && !status.enabled) return <p className="py-8 text-center text-sm text-muted">The AI analyst isn&apos;t set up on this server.</p>;
  const canAsk = Boolean(user) || !clerkEnabled;

  const run = async (q: string, catchUp = false) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setTurns((t) => [...t, { q }]);
    setQuestion("");
    try {
      const r = catchUp ? await api<{ text: string }>("/api/ai/catch-up") : await api<{ answer: string }>("/api/ai/ask", { body: { question: q } });
      const a = "text" in r ? r.text : r.answer;
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x)));
    } catch (err) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: (err as Error).message } : x)));
    } finally {
      setBusy(false);
    }
  };

  const suggestions = ["Who is fastest right now?", "How is the strategy playing out?", focusName ? `How is ${focusName} doing?` : "Who has gained the most places?"];

  return (
    <div className="space-y-3">
      <button onClick={() => run("Catch me up", true)} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50">
        <Sparkles size={15} /> Catch me up
      </button>
      <ul className="space-y-3" aria-live="polite">
        {turns.map((t, i) => (
          <li key={i} className="space-y-1.5">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-surface-3 px-3 py-1.5 text-sm">{t.q}</p>
            {t.a ? (
              <p className="max-w-[95%] rounded-2xl rounded-bl-md bg-surface-2 px-3 py-2 text-sm leading-relaxed whitespace-pre-line">{t.a}</p>
            ) : t.error ? (
              <p className="text-sm text-bad">{t.error}</p>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Looking at the data…</p>
            )}
          </li>
        ))}
      </ul>
      {canAsk ? (
        <>
          {turns.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button key={s} onClick={() => run(s)} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:text-ink">
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(question);
            }}
            className="flex gap-2"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={300}
              placeholder="Ask about this session…"
              aria-label="Question for the analyst"
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button disabled={!question.trim() || busy} aria-label="Ask" className={cn("rounded-xl bg-accent px-3 text-accent-ink disabled:opacity-40")}>
              <Send size={16} />
            </button>
          </form>
          <p className="text-[11px] text-faint">Answers are written by AI from the live timing data and can be wrong.</p>
        </>
      ) : (
        <SignInCta />
      )}
    </div>
  );
}
