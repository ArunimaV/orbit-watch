/** Wall clock while the pass is still ahead; otherwise the demo clock plus elapsed time. */
export function countdownClockMs(tcaMs: number, wallMs: number, demoNowMs: number, elapsedMs: number): number {
  if (!Number.isFinite(tcaMs) || !Number.isFinite(wallMs)) return wallMs;
  if (wallMs < tcaMs) return wallMs;
  if (!Number.isFinite(demoNowMs)) return wallMs;
  return demoNowMs + Math.max(0, elapsedMs);
}

/** Compact remaining time, such as "in 5h 26m". */
export function formatCountdown(tcaMs: number, nowMs: number): string {
  const delta = tcaMs - nowMs;
  if (!Number.isFinite(delta) || delta < 1000) return delta <= 0 ? "passed" : "now";
  const totalSeconds = Math.floor(delta / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return hours > 0 ? `in ${days}d ${hours}h` : `in ${days}d`;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  if (minutes > 0) return `in ${minutes}m ${seconds}s`;
  return `in ${seconds}s`;
}

export function socratesTableUrl(norad: number): string {
  return `https://celestrak.org/SOCRATES/table-socrates.php?CATNR=${norad}&ORDER=MINRANGE&MAX=25`;
}

export function threatHeadline(count: number, satelliteName: string, when: string | null): string {
  const threats = count === 1 ? "1 real threat" : `${count} real threats`;
  const day = when ? ` ${when}` : "";
  return `Heads up: ${threats} to ${satelliteName}${day}`;
}
