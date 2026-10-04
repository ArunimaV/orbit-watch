"use client";

import dynamic from "next/dynamic";
import type { RankedEvent } from "@/lib/types";

const CesiumGlobe = dynamic(() => import("./CesiumGlobe"), {
  ssr: false,
  loading: () => (
    <section className="flex min-h-[320px] items-center justify-center border-edge bg-panel text-sm text-muted md:border-x">
      Loading globe…
    </section>
  ),
});

export function Globe({ event }: { event: RankedEvent | null }) {
  return <CesiumGlobe event={event} />;
}
