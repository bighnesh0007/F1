"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Flag, Send, Trash2, VolumeX } from "lucide-react";
import { api, useAuth } from "@/lib/auth";
import { clerkEnabled } from "@/lib/clerk";
import { localTime } from "@/lib/format";
import { teamById } from "@/lib/teams";
import type { ChatMessage } from "@/lib/types-user";
import { Segmented, cn } from "@/components/ui";
import { Avatar } from "@/components/account/Avatar";
import { SignInCta } from "@/components/account/ClerkControls";

const MUTED_KEY = "f1live.chatMuted";
const readMuted = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(MUTED_KEY) ?? "[]");
  } catch {
    return [];
  }
};

// Live chat: everyone, or just your team's tribe.
export function Chat() {
  const { user } = useAuth();
  const tribe = user?.profile.team ? teamById(user.profile.team) : null;
  const [room, setRoom] = useState("everyone");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState<string[]>([]);
  const list = useRef<HTMLUListElement>(null);
  const atBottom = useRef(true);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => alive && setMuted(readMuted()), 0);
    fetch(`/api/chat/${room}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((m: ChatMessage[]) => alive && setMessages(m))
      .catch(() => {});
    const source = new EventSource(`/api/chat/${room}/stream`);
    source.addEventListener("message", (e) => {
      const m: ChatMessage = JSON.parse((e as MessageEvent).data);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev.slice(-199), m]));
    });
    source.addEventListener("remove", (e) => {
      const { id } = JSON.parse((e as MessageEvent).data);
      setMessages((prev) => prev.filter((x) => x.id !== id));
    });
    return () => {
      alive = false;
      clearTimeout(t);
      source.close();
    };
  }, [room]);

  useEffect(() => {
    if (atBottom.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    try {
      const m = await api<ChatMessage>(`/api/chat/${room}`, { body: { text } });
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setText("");
      atBottom.current = true;
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const mute = (handle: string) => {
    const next = [...new Set([...muted, handle])];
    setMuted(next);
    try {
      localStorage.setItem(MUTED_KEY, JSON.stringify(next));
    } catch {}
  };

  const shown = messages.filter((m) => !m.hidden && m.text && !muted.includes(m.user.handle));

  return (
    <div className="flex flex-col gap-3">
      {tribe && (
        <div className="[&>div]:flex [&>div]:w-full [&_button]:flex-1">
          <Segmented
            size="sm"
            value={room}
            onChange={(r) => {
              setRoom(r);
              setMessages([]);
            }}
            options={[
              { value: "everyone", label: "Everyone" },
              { value: `tribe-${tribe.id}`, label: tribe.tribe },
            ]}
          />
        </div>
      )}
      <ul
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="scroll-thin h-[380px] space-y-2 overflow-y-auto pr-1"
        aria-live="polite"
      >
        {shown.length === 0 && <li className="py-10 text-center text-sm text-muted">No messages yet. Say hi!</li>}
        {shown.map((m) => {
          const mine = user?.handle === m.user.handle;
          const team = teamById(m.user.team);
          return (
            <li key={m.id} className="group flex gap-2">
              <Avatar name={m.user.displayName} src={m.user.avatarUrl} team={m.user.team} size={28} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs">
                  <Link href={`/u/${m.user.handle}`} className="font-semibold hover:underline" style={team ? { color: `#${team.colour}` } : undefined}>
                    {m.user.displayName}
                  </Link>
                  <span className="text-faint">{localTime(m.at)}</span>
                  <span className="ml-auto flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {mine ? (
                      <button onClick={() => api(`/api/chat/messages/${m.id}`, { method: "DELETE" }).catch(() => {})} aria-label="Delete message" className="rounded p-1 text-faint hover:text-ink">
                        <Trash2 size={12} />
                      </button>
                    ) : (
                      <>
                        {user && (
                          <button onClick={() => api(`/api/chat/messages/${m.id}/report`, { method: "POST" }).catch(() => {})} aria-label="Report message" title="Report" className="rounded p-1 text-faint hover:text-ink">
                            <Flag size={12} />
                          </button>
                        )}
                        <button onClick={() => mute(m.user.handle)} aria-label={`Hide messages from ${m.user.displayName}`} title="Hide this fan" className="rounded p-1 text-faint hover:text-ink">
                          <VolumeX size={12} />
                        </button>
                      </>
                    )}
                  </span>
                </p>
                <p className="text-sm break-words">{m.text}</p>
              </div>
            </li>
          );
        })}
      </ul>
      {user ? (
        <form onSubmit={send} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={280}
            placeholder={room === "everyone" ? "Say something to everyone…" : `Talk to the ${tribe?.tribe}…`}
            aria-label="Message"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button disabled={!text.trim()} aria-label="Send" className="rounded-xl bg-accent px-3 text-accent-ink disabled:opacity-40">
            <Send size={16} />
          </button>
        </form>
      ) : clerkEnabled ? (
        <SignInCta />
      ) : (
        <p className="text-xs text-muted">Sign-in isn&apos;t set up on this server, so chat is read-only.</p>
      )}
      {error && <p role="alert" className={cn("text-xs text-bad")}>{error}</p>}
    </div>
  );
}
