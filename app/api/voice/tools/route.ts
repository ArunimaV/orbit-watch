import { NextResponse } from "next/server";
import { runVoiceTool } from "@/lib/voice-tools";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ output: { error: "Expected JSON" } }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const name = typeof record.name === "string" ? record.name : "";
  const args = record.arguments ?? record.args ?? {};
  const output = await runVoiceTool(name, args);
  return NextResponse.json({ output });
}
