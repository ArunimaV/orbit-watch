"use client";

import { useState } from "react";
import { Globe } from "@/components/Globe";
import { VoicePanel } from "@/components/VoicePanel";
import { WarningList } from "@/components/WarningList";
import { DEMO_NORAD } from "@/lib/constants";
import type { RankedEvent } from "@/lib/types";

export function Dashboard() {
  const [selected, setSelected] = useState<RankedEvent | null>(null);
  const [norad, setNorad] = useState(DEMO_NORAD);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(240px,300px)]">
      <WarningList selectedId={selected?.id ?? null} onSelect={setSelected} onNorad={setNorad} />
      <Globe event={selected} />
      <VoicePanel norad={norad} encounterId={selected?.id ?? null} />
    </div>
  );
}
