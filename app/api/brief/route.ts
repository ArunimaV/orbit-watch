import { NextResponse } from "next/server";
import { createBriefing } from "@/lib/briefing";
import { DEMO_NORAD } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const noradValue = record.norad === undefined ? DEMO_NORAD : Number(record.norad);
  if (!Number.isInteger(noradValue) || noradValue <= 0) {
    return NextResponse.json({ error: "norad must be a positive integer" }, { status: 400 });
  }
  const timeZone = typeof record.timeZone === "string" ? record.timeZone : "UTC";
  const encounterId = typeof record.encounterId === "string" ? record.encounterId : null;

  try {
    const briefing = await createBriefing({ norad: noradValue, timeZone, encounterId });
    return NextResponse.json(briefing);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not write the briefing";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
