"use client";

import { useEffect, useState } from "react";
import { countdownClockMs, formatCountdown } from "@/lib/countdown";

export function Countdown({
  tca,
  evaluatedAt,
  startedAt,
}: {
  tca: string;
  evaluatedAt: string;
  startedAt: number;
}) {
  const [wall, setWall] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setWall(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (wall === null) return null;
  const tcaMs = Date.parse(tca);
  const demoMs = Date.parse(evaluatedAt);
  const nowMs = countdownClockMs(tcaMs, wall, demoMs, wall - startedAt);
  return <span className="font-mono text-[11px] text-accent">{formatCountdown(tcaMs, nowMs)}</span>;
}
