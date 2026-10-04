"use client";

import { useEffect, useState } from "react";
import { threatHeadline } from "@/lib/countdown";

const SESSION_KEY = "orbit-watch-alert";

export function ThreatAlert({
  armed,
  count,
  satelliteName,
  when,
}: {
  armed: boolean;
  count: number;
  satelliteName: string;
  when: string | null;
}) {
  const [visible, setVisible] = useState(false);
  const headline = threatHeadline(count, satelliteName, when);

  useEffect(() => {
    if (!armed || count < 1) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled || sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
      setVisible(true);
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [armed, count]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto orbit-fade-in flex max-w-lg items-center gap-3 rounded border border-act/50 bg-panel/95 px-4 py-3 shadow-lg"
      >
        <p className="text-sm leading-snug text-foreground">{headline}</p>
        <button
          type="button"
          className="shrink-0 text-[11px] tracking-wide text-muted uppercase"
          onClick={() => setVisible(false)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
