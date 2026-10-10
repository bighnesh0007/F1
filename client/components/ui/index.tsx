"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EyeOff, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { TYRES } from "@/lib/live";
import { countdownParts } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { useSettings } from "@/lib/settings";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({
  title,
  icon,
  right,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const t = useT();
  return (
    <section className={cn("rounded-2xl border border-line bg-surface shadow-card", className)}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-muted">
            {icon && <span className="text-faint">{icon}</span>}
            {typeof title === "string" ? t(title) : title}
          </h2>
          {right}
        </header>
      )}
      <div className={cn("px-4 pb-4", !title && !right && "pt-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Pill({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span style={style} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", className)}>
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const t = useT();
  return (
    <div role="tablist" className="inline-flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative rounded-lg font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
            o.value === value ? "text-ink" : "text-muted hover:text-ink",
          )}
        >
          {o.value === value && (
            <motion.span layoutId={`seg-${options.map((x) => x.value).join("")}`} className="absolute inset-0 rounded-lg bg-surface shadow-card" transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />
          )}
          <span className="relative">{typeof o.label === "string" ? t(o.label) : o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function TeamBar({ colour, className }: { colour?: string; className?: string }) {
  return <span className={cn("inline-block w-1 shrink-0 rounded-full", className ?? "h-4")} style={{ background: `#${colour ?? "888"}` }} />;
}

export function Tyre({ compound, laps, isNew, size = 20 }: { compound?: string | null; laps?: number | null; isNew?: boolean; size?: number }) {
  const tyre = compound ? TYRES[compound] : undefined;
  if (!tyre) return <span className="text-faint">–</span>;
  return (
    <span className="inline-flex items-center gap-1.5" title={`${tyre.name}${isNew ? " (new)" : ""}${laps != null ? `, ${laps} laps` : ""}`}>
      <span
        className="flex items-center justify-center rounded-full font-display font-bold text-ink"
        style={{ width: size, height: size, border: `2.5px solid ${tyre.color}`, fontSize: size * 0.5 }}
      >
        {tyre.short}
      </span>
      {laps != null && <span className="tnum text-xs text-muted">{laps}</span>}
    </span>
  );
}

export function Headshot({ src, colour, size = 40, alt }: { src?: string | null; colour?: string; size?: number; alt: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="relative inline-flex shrink-0 items-end justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, background: `linear-gradient(160deg, #${colour ?? "888"}55, #${colour ?? "888"}22)` }}
    >
      {src && !failed ? (
        // Driver photos come from F1's media server; plain <img> avoids image optimisation config.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} width={size} height={size} onError={() => setFailed(true)} className="h-full w-full object-cover object-top" />
      ) : (
        <span className="self-center font-display font-bold text-ink" style={{ fontSize: size * 0.34 }}>
          {alt.slice(0, 3).toUpperCase()}
        </span>
      )}
    </span>
  );
}

// Hides results until tapped when spoiler-free mode is on.
export function Spoiler({ children, label = "Result hidden", className }: { children: React.ReactNode; label?: string; className?: string }) {
  const { settings } = useSettings();
  const [revealed, setRevealed] = useState(false);
  if (!settings.spoilerFree || revealed) return <>{children}</>;
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setRevealed(true);
      }}
      className={cn("flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center", className)}
    >
      <EyeOff size={18} className="text-faint" />
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-muted">Spoiler-free mode is on. Tap to reveal.</span>
    </button>
  );
}

export function Sheet({ open, onClose, title, children, side = "right" }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; side?: "right" | "bottom" }) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    // Move focus into the sheet, keep Tab inside it, and give focus back on close.
    const before = document.activeElement as HTMLElement | null;
    const focusFirst = setTimeout(() => panel.current?.querySelector<HTMLElement>("button, [href], input, [tabindex]")?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute("disabled"));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focusFirst);
      window.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : undefined}
            className={cn(
              "absolute flex flex-col bg-surface shadow-2xl",
              side === "right" ? "top-0 right-0 h-full w-full max-w-md border-l border-line" : "inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl border-t border-line",
            )}
            initial={side === "right" ? { x: "100%" } : { y: "100%" }}
            animate={side === "right" ? { x: 0 } : { y: 0 }}
            exit={side === "right" ? { x: "100%" } : { y: "100%" }}
            transition={{ type: "spring", bounce: 0.1, duration: 0.45 }}
          >
            <header className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-display text-lg font-bold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-ink">
                <X size={18} />
              </button>
            </header>
            <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Countdown({ to, compact = false }: { to: string; compact?: boolean }) {
  const now = useNow(1000);
  if (now == null) return <span className="tnum">&nbsp;</span>;
  const { days, hours, minutes, seconds } = countdownParts(Date.parse(to) - now);
  if (compact) {
    return (
      <span className="tnum">
        {days > 0 && `${days}d `}
        {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
    );
  }
  const parts = [
    { v: days, l: "days" },
    { v: hours, l: "hrs" },
    { v: minutes, l: "min" },
    { v: seconds, l: "sec" },
  ];
  return (
    <div className="flex gap-2 sm:gap-3">
      {parts.map((p) => (
        <div key={p.l} className="min-w-14 rounded-xl bg-surface-2 px-2 py-2 text-center sm:min-w-16">
          <div className="tnum font-display text-2xl font-bold sm:text-3xl">{String(p.v).padStart(2, "0")}</div>
          <div className="text-[11px] tracking-wide text-muted uppercase">{p.l}</div>
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      {icon && <div className="mb-1 text-faint">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-2", className)} />;
}

export function ErrorNote({ message }: { message: string }) {
  return <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">Couldn&apos;t load this right now ({message}). It will retry automatically.</p>;
}
