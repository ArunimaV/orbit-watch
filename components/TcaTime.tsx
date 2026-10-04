"use client";

import { formatApproachTime } from "@/lib/time-format";

export function TcaTime({ iso, nowIso }: { iso: string; nowIso: string }) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const parsed = new Date(nowIso);
  const now = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const when = formatApproachTime(iso, zone, now);
  return (
    <span className="block">
      <span className="block leading-snug">{when.label}</span>
      <span className="block text-[10px] text-muted">{when.utc}</span>
    </span>
  );
}
