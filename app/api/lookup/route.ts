import { NextResponse } from "next/server";
import { DEFAULT_HORIZON_HOURS, DEMO_NORAD, KNOWN_SATELLITES } from "@/lib/constants";
import { lookupConjunctions } from "@/lib/lookup";
import { rankConjunctions } from "@/lib/rank";

export const dynamic = "force-dynamic";

function parseClientNow(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const norad = Number(url.searchParams.get("norad"));
  const horizonHours = Number(url.searchParams.get("horizon") ?? DEFAULT_HORIZON_HOURS);

  if (!Number.isInteger(norad) || norad <= 0) {
    return NextResponse.json({ ok: false, message: "Enter a numeric NORAD ID." }, { status: 400 });
  }
  if (!Number.isFinite(horizonHours) || horizonHours <= 0 || horizonHours > 24 * 14) {
    return NextResponse.json(
      { ok: false, message: "Horizon must be between 1 hour and 14 days." },
      { status: 400 },
    );
  }
  if (norad === DEMO_NORAD) {
    return NextResponse.json({
      ok: false,
      message: "SwissCube stays on the saved demo. Use Back to SwissCube.",
    });
  }

  const looked = await lookupConjunctions(norad);
  if (!looked.ok) {
    return NextResponse.json(looked);
  }

  const now = parseClientNow(url.searchParams.get("clientNow")) ?? new Date();
  const result = rankConjunctions(looked.events, norad, now, horizonHours);
  const known = KNOWN_SATELLITES[norad];
  const dismissedCount = result.dismissed.reduce((sum, group) => sum + group.count, 0);
  return NextResponse.json({
    ok: true,
    norad,
    satelliteName: known?.name ?? result.ranked[0]?.ours.name ?? `NORAD ${norad}`,
    satelliteDetail: known?.detail ?? null,
    horizonHours,
    now: now.toISOString(),
    generatedAt: new Date().toISOString(),
    source: "lookup",
    note: null,
    totalEvents: looked.events.length,
    ranked: result.ranked,
    dismissed: result.dismissed,
    dismissedCount,
    cached: looked.cached,
  });
}
