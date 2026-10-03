"use client";

import { useState } from "react";
import { Globe } from "@/components/Globe";
import { TranscriptPlaceholder } from "@/components/TranscriptPlaceholder";
import { WarningList } from "@/components/WarningList";
import type { RankedEvent } from "@/lib/types";

export function Dashboard() {
  const [selected, setSelected] = useState<RankedEvent | null>(null);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(240px,300px)]">
      <WarningList selectedId={selected?.id ?? null} onSelect={setSelected} />
      <Globe event={selected} />
      <TranscriptPlaceholder />
    </div>
  );
}
