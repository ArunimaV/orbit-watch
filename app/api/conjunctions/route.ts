import { NextResponse } from "next/server";
import { DEFAULT_HORIZON_HOURS, DEMO_NORAD, KNOWN_SATELLITES } from "@/lib/constants";
import { rankConjunctions } from "@/lib/rank";
import { eventsForNorad, loadConjunctionSource } from "@/lib/socrates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const norad = Number(url.searchParams.get("norad") ?? DEMO_NORAD);
  const horizonHours = Number(url.searchParams.get("horizon") ?? DEFAULT_HORIZON_HOURS);

  if (!Number.isInteger(norad) || norad <= 0) {
    return NextResponse.json({ error: "norad must be a positive integer" }, { status: 400 });
  }
  if (!Number.isFinite(horizonHours) || horizonHours <= 0 || horizonHours > 24 * 14) {
    return NextResponse.json({ error: "horizon must be a positive number of hours up to 336" }, { status: 400 });
  }

  try {
    const loaded = loadConjunctionSource();
    const events = eventsForNorad(loaded.snapshot, norad);
    const result = rankConjunctions(events, norad, new Date(), horizonHours);
    const known = KNOWN_SATELLITES[norad];
    const dismissedCount = result.dismissed.reduce((sum, group) => sum + group.count, 0);
    return NextResponse.json({
      norad,
      satelliteName: known?.name ?? result.ranked[0]?.ours.name ?? `NORAD ${norad}`,
      satelliteDetail: known?.detail ?? null,
      horizonHours,
      generatedAt: new Date().toISOString(),
      source: loaded.source,
      note: loaded.snapshot.note ?? null,
      totalEvents: events.length,
      ranked: result.ranked,
      dismissed: result.dismissed,
      dismissedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to rank conjunctions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
