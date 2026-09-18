/** No auth, no duplicate guard by design — the client only calls this once
 *  per video per session (sessionStorage dedupe in VideoCard), so this
 *  stays a plain increment rather than needing its own join table. */
import { NextResponse } from "next/server";
import { recordView } from "@/lib/videos";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await recordView(id);
  return NextResponse.json({ ok: true });
}
