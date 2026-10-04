import { NextResponse } from "next/server";
import { requestSpeech } from "@/lib/xai";

export const dynamic = "force-dynamic";

function readText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function speechResponse(text: string) {
  const result = await requestSpeech(text);
  if (!result.ok) {
    return NextResponse.json({ mock: true, message: result.message }, { status: result.status });
  }
  return new Response(result.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const text = new URL(request.url).searchParams.get("text") ?? "";
  return speechResponse(readText(text));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ mock: true, message: "Expected JSON" }, { status: 400 });
  }
  const text = body && typeof body === "object" ? readText((body as { text?: unknown }).text) : "";
  return speechResponse(text);
}
