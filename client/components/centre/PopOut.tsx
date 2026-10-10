"use client";

import { useT } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PictureInPicture2 } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { CompactTower, FlagPill } from "./CompactTower";

type PipWindow = Window & { document: Document };
type DocumentPip = { requestWindow: (o: { width: number; height: number }) => Promise<PipWindow> };

// Pops the timing out into a small always-on-top window (Document Picture-in-Picture,
// Chrome and Edge), to keep over a TV stream. Other browsers get a small popup window.
export function PopOutButton() {
  const t = useT();
  const [pip, setPip] = useState<PipWindow | null>(null);

  useEffect(() => {
    if (!pip) return;
    const onClose = () => setPip(null);
    pip.addEventListener("pagehide", onClose);
    return () => pip.removeEventListener("pagehide", onClose);
  }, [pip]);

  const open = async () => {
    const api = (window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture;
    if (!api) {
      window.open("/live/mini", "f1-mini", "popup,width=360,height=700");
      return;
    }
    const w = await api.requestWindow({ width: 340, height: 640 });
    // Copy the app's styles and theme into the new window.
    for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) w.document.head.appendChild(node.cloneNode(true));
    const root = document.documentElement;
    for (const attr of root.getAttributeNames()) if (attr !== "class") w.document.documentElement.setAttribute(attr, root.getAttribute(attr) ?? "");
    w.document.documentElement.className = root.className;
    w.document.documentElement.style.cssText = root.style.cssText;
    w.document.body.style.margin = "0";
    w.document.title = "F1 Live timing";
    setPip(w);
  };

  return (
    <>
      <button
        onClick={() => (pip ? pip.close() : open())}
        className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink"
        title="Keep the timing in a small floating window"
      >
        <PictureInPicture2 size={14} /> {pip ? "Close pop-out" : t("Pop out")}
      </button>
      {pip && createPortal(<MiniTiming />, pip.document.body)}
    </>
  );
}

export function MiniTiming() {
  const { topics } = useLive();
  const lap = topics.LapCount;
  return (
    <div className="min-h-screen bg-bg p-2 text-ink">
      <div className="mb-2 flex items-center justify-between gap-2 px-1 text-xs">
        <span className="truncate font-semibold">{topics.SessionInfo?.Meeting?.Name ?? "F1 Live"} · {topics.SessionInfo?.Name}</span>
        <span className="flex shrink-0 items-center gap-2">
          {lap?.CurrentLap != null && <span className="tnum font-display font-bold">L{lap.CurrentLap}{lap.TotalLaps ? `/${lap.TotalLaps}` : ""}</span>}
          <FlagPill className="text-[10px]" />
        </span>
      </div>
      <CompactTower />
    </div>
  );
}
