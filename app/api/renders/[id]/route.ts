import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { COMMITTED_RENDER_FILE, RENDER_TMP_DIR, readMemoryRender, sanitizeEncounterId } from "@/lib/imagine";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: raw } = await context.params;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const id = sanitizeEncounterId(decoded);
  if (!id) return new NextResponse("Not found", { status: 404 });

  const memory = readMemoryRender(id);
  if (memory) {
    return new NextResponse(new Uint8Array(memory), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const candidates = [
    path.join(RENDER_TMP_DIR, `${id}.jpg`),
    path.join(process.cwd(), "public", "renders", `${id}.jpg`),
    path.join(process.cwd(), "public", "renders", COMMITTED_RENDER_FILE),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
  return new NextResponse("Not found", { status: 404 });
}
