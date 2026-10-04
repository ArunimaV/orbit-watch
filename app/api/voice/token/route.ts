import { NextResponse } from "next/server";
import { mintRealtimeClientSecret, readXaiApiKey } from "@/lib/xai";
import { MISSING_KEY_MESSAGE } from "@/lib/xai-config";

export const dynamic = "force-dynamic";

/** Whether a server key is configured. Does not mint a secret. */
export async function GET() {
  if (!readXaiApiKey()) {
    return NextResponse.json({ configured: false, mock: true, message: MISSING_KEY_MESSAGE });
  }
  return NextResponse.json({ configured: true, mock: false });
}

/** Mint an ephemeral realtime client secret. The browser receives only value and expires_at. */
export async function POST() {
  const result = await mintRealtimeClientSecret();
  if (!result.ok) {
    return NextResponse.json({ mock: true, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ value: result.secret.value, expires_at: result.secret.expires_at });
}
