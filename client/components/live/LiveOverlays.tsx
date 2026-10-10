"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { useSettings } from "@/lib/settings";
import { isRaceSession, type LiveEvent } from "@/lib/live";
import { sounds } from "@/lib/sound";
import { cn } from "@/components/ui";
import { describeEvent } from "./SidePanels";

type Toast = { id: number; event: LiveEvent; mine: boolean };
type FlagMoment = { id: number; kind: "sc" | "vsc" | "red" | "chequered" | "green" };

const TOAST_TYPES = new Set(["overtake", "pitOut", "fastestLap", "retired"]);

const FLAG_STYLES: Record<FlagMoment["kind"], { label: string; sub?: string; bg: string; ink: string }> = {
  sc: { label: "Safety car", sub: "Field neutralised", bg: "linear-gradient(135deg, #facc15, #eab308)", ink: "#111" },
  vsc: { label: "Virtual safety car", sub: "Slow down, hold the gaps", bg: "linear-gradient(135deg, #fde047, #facc15)", ink: "#111" },
  red: { label: "Red flag", sub: "Session suspended", bg: "linear-gradient(135deg, #ef4444, #b91c1c)", ink: "#fff" },
  green: { label: "Green flag", sub: "Racing resumes", bg: "linear-gradient(135deg, #22c55e, #15803d)", ink: "#fff" },
  chequered: { label: "Chequered flag", bg: "repeating-conic-gradient(#111 0% 25%, #f5f5f5 0% 50%) 50% / 64px 64px", ink: "#111" },
};

// App-wide overlays driven by live events: pop-up alerts, flag moments, start lights.
export function LiveOverlays() {
  const { onEvent, topics } = useLive();
  const { get } = useDrivers();
  const { settings } = useSettings();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [flag, setFlag] = useState<FlagMoment | null>(null);
  const [lights, setLights] = useState<number | null>(null); // 0-5 lit, 6 = lights out
  const nextId = useRef(0);
  const topicsRef = useRef(topics);
  const settingsRef = useRef(settings);
  const lastTrackStatus = useRef<string | null>(null);

  useEffect(() => {
    topicsRef.current = topics;
    settingsRef.current = settings;
  }, [topics, settings]);

  useEffect(() => {
    return onEvent((event) => {
      const s = settingsRef.current;
      const race = isRaceSession(topicsRef.current);

      if (event.type === "radio" && s.sounds) sounds.radio();

      // Alerts are for races; practice and qualifying set "fastest laps" constantly.
      if (TOAST_TYPES.has(event.type) && s.alerts && race) {
        const mine = Boolean(s.favouriteDriver && (event.driver === s.favouriteDriver || event.passed === s.favouriteDriver));
        const id = nextId.current++;
        setToasts((prev) => [...prev.slice(-2), { id, event, mine }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), mine ? 8000 : 5000);
        if (s.sounds) sounds.alert();
      }

      if (event.type === "trackStatus" && event.status) {
        const prev = lastTrackStatus.current;
        lastTrackStatus.current = event.status;
        const kind = ({ "4": "sc", "6": "vsc", "5": "red" } as const)[event.status as "4" | "6" | "5"];
        const resumed = event.status === "1" && prev && ["4", "5", "6", "7"].includes(prev);
        if ((kind || resumed) && s.flagEffects && !s.reduceMotion) {
          setFlag({ id: nextId.current++, kind: kind ?? "green" });
          if (s.sounds) sounds.flag();
        }
      }

      if (event.type === "sessionStatus") {
        if ((event.status === "Finished" || event.status === "Ends") && s.flagEffects && !s.reduceMotion) {
          setFlag({ id: nextId.current++, kind: "chequered" });
          if (s.sounds) sounds.chequered();
        }
        if (event.status === "Started" && race && s.flagEffects && !s.reduceMotion) runLights();
      }
    });

    function runLights() {
      const s = settingsRef.current;
      for (let i = 1; i <= 5; i++) {
        setTimeout(() => {
          setLights(i);
          if (s.sounds) sounds.light();
        }, i * 700);
      }
      setTimeout(() => {
        setLights(6);
        if (s.sounds) sounds.lightsOut();
      }, 5 * 700 + 900);
      setTimeout(() => setLights(null), 5 * 700 + 3200);
    }
  }, [onEvent]);

  useEffect(() => {
    if (!flag) return;
    const t = setTimeout(() => setFlag(null), flag.kind === "chequered" ? 4000 : 2800);
    return () => clearTimeout(t);
  }, [flag]);

  const tla = (n?: string) => (n ? get(n).tla : "");

  return (
    <>
      {/* Pop-up alerts */}
      <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map(({ id, event, mine }) => {
            const d = describeEvent(event, tla);
            const colour = get(event.driver).colour;
            return (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, y: -16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                transition={{ type: "spring", bounce: 0.25, duration: 0.45 }}
                className={cn(
                  "pointer-events-auto flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-2xl border bg-surface/95 px-4 py-3 shadow-card backdrop-blur",
                  mine ? "border-accent" : "border-line",
                )}
              >
                <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: `#${colour}` }} />
                <span className={cn("shrink-0", d.tone)}>{d.icon}</span>
                <div className="min-w-0">
                  <p className="font-display leading-tight font-bold">{d.title}</p>
                  {d.detail && <p className="text-xs text-muted">{d.detail}</p>}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Flag moments */}
      <AnimatePresence>
        {flag && (
          <motion.div
            key={flag.id}
            className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className="absolute inset-0 opacity-90" style={{ background: FLAG_STYLES[flag.kind].bg }} />
            <motion.div
              className="relative rounded-3xl bg-black/25 px-10 py-6 text-center backdrop-blur-sm"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", bounce: 0.35, duration: 0.6 }}
            >
              <p className="font-display text-5xl font-bold tracking-tight uppercase sm:text-7xl" style={{ color: flag.kind === "chequered" ? "#fff" : FLAG_STYLES[flag.kind].ink }}>
                {FLAG_STYLES[flag.kind].label}
              </p>
              {FLAG_STYLES[flag.kind].sub && <p className="mt-1 text-lg font-semibold" style={{ color: FLAG_STYLES[flag.kind].ink }}>{FLAG_STYLES[flag.kind].sub}</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Start lights */}
      <AnimatePresence>
        {lights != null && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex gap-3 rounded-3xl bg-neutral-900 p-4 shadow-2xl sm:gap-5 sm:p-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex flex-col gap-2 rounded-2xl bg-black p-2 sm:p-3">
                  {[0, 1].map((row) => (
                    <span
                      key={row}
                      className="h-9 w-9 rounded-full transition-all duration-150 sm:h-14 sm:w-14"
                      style={{
                        background: lights !== 6 && lights >= i ? "radial-gradient(circle at 35% 35%, #ff6b6b, #e10600 60%, #7f0000)" : "#2a2a2a",
                        boxShadow: lights !== 6 && lights >= i ? "0 0 24px 6px rgba(225,6,0,0.55)" : "none",
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
            <AnimatePresence>
              {lights === 6 && (
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 font-display text-4xl font-bold tracking-tight text-white uppercase sm:text-6xl"
                >
                  Lights out!
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
