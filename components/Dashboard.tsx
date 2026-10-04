"use client";

import { useEffect, useState } from "react";
import { Globe } from "@/components/Globe";
import { VoicePanel } from "@/components/VoicePanel";
import { WarningList } from "@/components/WarningList";
import { DEMO_NORAD } from "@/lib/constants";
import type { RankedEvent } from "@/lib/types";

export function Dashboard() {
  const [selected, setSelected] = useState<RankedEvent | null>(null);
  const [norad, setNorad] = useState(DEMO_NORAD);
  const [evaluatedAt, setEvaluatedAt] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  useEffect(() => {
    setStartedAt(Date.now());
  }, []);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(240px,300px)]">
      <WarningList
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        onNorad={setNorad}
        onEvaluated={setEvaluatedAt}
        startedAt={startedAt}
      />
      <Globe event={selected} evaluatedAt={evaluatedAt} startedAt={startedAt} />
      <VoicePanel norad={norad} encounterId={selected?.id ?? null} evaluatedAt={evaluatedAt} />
    </div>
  );
}
