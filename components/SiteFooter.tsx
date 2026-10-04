"use client";

import { useEffect, useState } from "react";

export function SiteFooter() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-edge bg-panel px-4 py-2 text-center text-[11px] tracking-wide text-muted">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-edge px-2 py-0.5 tracking-wide text-foreground uppercase hover:border-accent"
      >
        How it works
      </button>
      <p className="uppercase">
        Data courtesy of CelesTrak (Dr. T.S. Kelso). Not for operational use.
      </p>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="how-it-works-title"
            className="max-w-lg rounded border border-edge bg-panel p-5 text-left tracking-normal text-foreground normal-case"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="how-it-works-title" className="text-base font-medium">
              How it works
            </h2>
            <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-muted">
              <p>
                Warnings come from CelesTrak SOCRATES Plus. Orbits come from CelesTrak GP element sets, propagated with satellite.js.
              </p>
              <p>
                False alarms are filtered out: docked or co-orbiting objects, low-probability far misses, passes that already happened, passes outside the horizon, and extra orbits of the same pair.
              </p>
              <p>
                What remains is ranked by probability, miss distance, relative speed, time to closest approach, and whether the other object can be coordinated with.
              </p>
              <p>
                Grok Voice briefs the top warning in your local time. Grok Imagine draws an artist&apos;s rendering from those numbers. It is not a photograph, and this is not for operational use.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 rounded border border-edge px-3 py-1 text-xs tracking-wide text-foreground uppercase hover:border-accent"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </footer>
  );
}
