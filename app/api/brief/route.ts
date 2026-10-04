import { NextResponse } from "next/server";
import { createBriefing } from "@/lib/briefing";
import { DEMO_NORAD } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseClientNow(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

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
  const clientNow = parseClientNow(record.clientNow);
  const localOnly = record.localOnly === true;

  try {
    const briefing = await createBriefing({
      norad: noradValue,
      timeZone,
      encounterId,
      toolOptions: clientNow ? { clientNow } : undefined,
      localOnly,
    });
    return NextResponse.json(briefing);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not write the briefing";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
