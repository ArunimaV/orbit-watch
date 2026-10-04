"use client";

import dynamic from "next/dynamic";
import type { GlobeBoard } from "@/lib/orbit-board";
import type { RankedEvent } from "@/lib/types";

const CesiumGlobe = dynamic(() => import("./CesiumGlobe"), {
  ssr: false,
  loading: () => (
    <section className="flex min-h-[320px] items-center justify-center border-edge bg-panel text-sm text-muted md:border-x">
      Loading globe…
    </section>
  ),
});

export function Globe({
  event,
  board,
  evaluatedAt,
  startedAt,
  onDemoFlown,
}: {
  event: RankedEvent | null;
  board?: GlobeBoard | null;
  evaluatedAt: string | null;
  startedAt: number | null;
  onDemoFlown?: () => void;
}) {
  return (
    <CesiumGlobe
      event={event}
      board={board}
      evaluatedAt={evaluatedAt}
      startedAt={startedAt}
      onDemoFlown={onDemoFlown}
    />
  );
}
