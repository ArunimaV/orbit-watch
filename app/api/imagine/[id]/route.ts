import { NextResponse } from "next/server";
import { resolveEncounterRender } from "@/lib/imagine";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let decoded = id;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    decoded = id;
  }
  const result = await resolveEncounterRender(decoded);
  return NextResponse.json(result);
}
