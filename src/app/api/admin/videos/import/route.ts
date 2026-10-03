/** Circuit — staff import the latest clips from the curated YouTube channels (as drafts). */

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { ingestYouTubeShorts } from "@/lib/videoIngest";

export async function POST() {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  try {
    const result = await ingestYouTubeShorts();
    await logAdminAction({ actorId: auth.user.id, action: "videos.import", metadata: result });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed." }, { status: 502 });
  }
}
