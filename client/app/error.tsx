"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { reportError } from "@/lib/report";

// Shown when a page crashes; the rest of the app (header, navigation) keeps working.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError(error), [error]);
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="font-display text-2xl font-bold">Something went wrong on this page</p>
      <p className="mt-2 text-muted">It has been reported. Try again, or pick another page.</p>
      <button onClick={reset} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">
        <RotateCcw size={15} /> Try again
      </button>
    </div>
  );
}
