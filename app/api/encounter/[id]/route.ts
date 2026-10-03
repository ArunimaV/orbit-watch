import { NextResponse } from "next/server";
import { propagateEncounter } from "@/lib/encounter";
import { getOmm } from "@/lib/gp";
import { findEventById, loadConjunctionSource } from "@/lib/socrates";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const decoded = decodeURIComponent(id);

  try {
    const loaded = loadConjunctionSource();
    const found = findEventById(loaded.snapshot, decoded);
    if (!found) {
      return NextResponse.json({ error: "Unknown conjunction" }, { status: 404 });
    }

    const [ours, other] = await Promise.all([getOmm(found.oursNorad), getOmm(found.otherNorad)]);
    if (!ours.omm || !other.omm) {
      const missing = [
        ours.omm ? null : found.oursNorad,
        other.omm ? null : found.otherNorad,
      ].filter((norad): norad is number => norad !== null);
      return NextResponse.json(
        {
          error: "Orbital elements are not available for this pair",
          missing,
          warnings: [ours.warning, other.warning].filter((warning): warning is string => Boolean(warning)),
        },
        { status: 404 },
      );
    }

    const propagation = propagateEncounter(ours.omm, other.omm, found.event.tca);
    const oursIsFirst = found.event.object1.noradId === found.oursNorad;
    return NextResponse.json({
      id: decoded,
      tca: found.event.tca,
      ours: {
        noradId: found.oursNorad,
        name: oursIsFirst ? found.event.object1.name : found.event.object2.name,
        ommSource: ours.source,
      },
      other: {
        noradId: found.otherNorad,
        name: oursIsFirst ? found.event.object2.name : found.event.object1.name,
        ommSource: other.source,
      },
      socratesRangeKm: found.event.rangeKm,
      stepSeconds: propagation.stepSeconds,
      windowMinutes: propagation.windowMinutes,
      tracks: {
        ours: propagation.ours,
        other: propagation.other,
      },
      computedMinRangeKm: propagation.computedMinRangeKm,
      computedMinRangeTime: propagation.computedMinRangeTime,
      note:
        ours.source === "fixture" || other.source === "fixture"
          ? "One or both element sets are synthetic fixtures, so the computed miss distance will not match SOCRATES."
          : "Computed with satellite.js json2satrec from OMM JSON.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to propagate the encounter";
    const status = message.includes("could not propagate") ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
