"use client";

import { useEffect, useState } from "react";
import { Globe } from "@/components/Globe";
import { ThreatAlert } from "@/components/ThreatAlert";
import { VoicePanel } from "@/components/VoicePanel";
import { WarningList } from "@/components/WarningList";
import { DEMO_ENCOUNTER_NORAD, DEMO_NORAD } from "@/lib/constants";
import type { RankedEvent } from "@/lib/types";

export function Dashboard() {
  const [selected, setSelected] = useState<RankedEvent | null>(null);
  const [norad, setNorad] = useState(DEMO_NORAD);
  const [evaluatedAt, setEvaluatedAt] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [flown, setFlown] = useState(false);
  const [threat, setThreat] = useState<{ count: number; satelliteName: string; when: string | null } | null>(null);

  useEffect(() => {
    setStartedAt(Date.now());
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    if (selected.ours.noradId !== DEMO_NORAD || selected.other.noradId !== DEMO_ENCOUNTER_NORAD) return undefined;
    const timer = window.setTimeout(() => setFlown(true), 3200);
    return () => window.clearTimeout(timer);
  }, [selected]);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(240px,300px)]">
      <ThreatAlert
        armed={flown}
        count={threat?.count ?? 0}
        satelliteName={threat?.satelliteName ?? "SwissCube"}
        when={threat?.when ?? null}
      />
      <WarningList
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        onNorad={setNorad}
        onEvaluated={setEvaluatedAt}
        startedAt={startedAt}
        onThreat={setThreat}
      />
      <Globe event={selected} evaluatedAt={evaluatedAt} startedAt={startedAt} onDemoFlown={() => setFlown(true)} />
      <VoicePanel norad={norad} encounterId={selected?.id ?? null} evaluatedAt={evaluatedAt} />
    </div>
  );
}
