"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, Smartphone } from "lucide-react";
import { Section } from "./Toggle";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// The browser's install offer is only fired once per page load, so keep it globally.
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function InstallApp() {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred != null, () => false);
  const installed = useSyncExternalStore(subscribe, () => window.matchMedia("(display-mode: standalone)").matches, () => false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setIos(/iphone|ipad|ipod/i.test(navigator.userAgent)), 0);
    return () => clearTimeout(id);
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    listeners.forEach((l) => l());
  };

  return (
    <Section icon={<Smartphone size={16} />} title="App" hint="Install F1 Live on your home screen: it opens full screen, works offline and can send notifications.">
      {installed ? (
        <p className="text-sm text-muted">You&apos;re using the installed app.</p>
      ) : canPrompt ? (
        <button onClick={install} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">
          <Download size={15} /> Install F1 Live
        </button>
      ) : ios ? (
        <p className="flex items-center gap-1.5 text-sm text-muted">
          In Safari, tap <Share size={14} className="inline" /> Share, then &ldquo;Add to Home Screen&rdquo;.
        </p>
      ) : (
        <p className="text-sm text-muted">Use your browser&apos;s menu: &ldquo;Install app&rdquo; or &ldquo;Add to Home screen&rdquo;.</p>
      )}
    </Section>
  );
}
