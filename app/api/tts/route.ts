import { NextResponse } from "next/server";
import { requestSpeech } from "@/lib/xai";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ mock: true, message: "Expected JSON" }, { status: 400 });
  }
  const text = body && typeof body === "object" && typeof (body as { text?: unknown }).text === "string"
    ? (body as { text: string }).text
    : "";
  const result = await requestSpeech(text);
  if (!result.ok) {
    return NextResponse.json({ mock: true, message: result.message }, { status: result.status });
  }
  return new NextResponse(Buffer.from(result.audio), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
