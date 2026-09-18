/** No auth required — sharing a public video isn't a per-user action that
 *  needs a duplicate guard the way like/save do (spec section 13). */
import { NextResponse } from "next/server";
import { recordShare } from "@/lib/videos";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await recordShare(id);
  return NextResponse.json({ ok: true });
}
